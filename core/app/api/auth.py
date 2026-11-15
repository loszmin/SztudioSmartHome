from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from app import models, schemas
from app.api.common import get_or_404
from app.auth import AdminPrincipal, CurrentPrincipal, DbSession
from app.security import generate_api_token, hash_api_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Uwierzytelnianie"])


@router.post("/login", response_model=schemas.LoginResponse)
def login(body: schemas.LoginRequest, request: Request, session: DbSession) -> schemas.LoginResponse:
    throttle = request.app.state.login_throttle
    client = request.client.host if request.client else "unknown"

    retry_after = throttle.retry_after(body.username, client)
    if retry_after:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Zbyt wiele nieudanych prób logowania. Spróbuj ponownie później.",
            headers={"Retry-After": str(retry_after)},
        )

    user = session.scalars(select(models.User).where(models.User.username == body.username)).first()
    valid = verify_password(body.password, user.password_hash if user else None)
    if user is None or not valid or not user.is_active:
        throttle.record_failure(body.username, client)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Nieprawidłowy login lub hasło.")

    throttle.reset(body.username, client)
    user.last_login_at = models.utcnow()
    session.commit()
    token, expires_at = request.app.state.signer.issue(user.id, user.token_version)
    return schemas.LoginResponse(
        access_token=token, expires_at=expires_at, user=schemas.UserOut.model_validate(user)
    )


@router.get("/me", response_model=schemas.UserOut)
def me(principal: CurrentPrincipal) -> schemas.UserOut:
    return schemas.UserOut(id=principal.user_id, username=principal.username, role=principal.role)  # type: ignore[arg-type]


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: schemas.ChangePasswordRequest, principal: CurrentPrincipal, session: DbSession
) -> Response:
    if principal.via_api_token:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Zmiana hasła wymaga zalogowania loginem i hasłem.")
    user = session.get(models.User, principal.user_id)
    if user is None or not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bieżące hasło jest nieprawidłowe.")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1  # unieważnia wszystkie dotychczasowe tokeny dostępu
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tokens", response_model=list[schemas.ApiTokenOut])
def list_api_tokens(_: AdminPrincipal, session: DbSession) -> list[models.ApiToken]:
    return list(
        session.scalars(
            select(models.ApiToken)
            .where(models.ApiToken.revoked_at.is_(None))
            .order_by(models.ApiToken.created_at)
        )
    )


@router.post("/tokens", response_model=schemas.ApiTokenCreated, status_code=status.HTTP_201_CREATED)
def create_api_token(
    body: schemas.ApiTokenCreate, principal: AdminPrincipal, session: DbSession
) -> schemas.ApiTokenCreated:
    token = generate_api_token()
    record = models.ApiToken(
        id=models.new_id(),
        name=body.name,
        token_hash=hash_api_token(token),
        prefix=token[:10],
        role=body.role,
        user_id=principal.user_id,
        created_at=models.utcnow(),
    )
    session.add(record)
    session.commit()
    return schemas.ApiTokenCreated(
        id=record.id,
        name=record.name,
        prefix=record.prefix,
        role=body.role,
        created_at=record.created_at,
        token=token,
    )


@router.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_token(token_id: str, _: AdminPrincipal, session: DbSession) -> Response:
    record = get_or_404(session, models.ApiToken, token_id, "token API")
    record.revoked_at = models.utcnow()
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
