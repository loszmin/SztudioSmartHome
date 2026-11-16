package pl.sztudio.smarthome.data.repository

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.Loadable
import pl.sztudio.smarthome.core.failed
import pl.sztudio.smarthome.data.api.ApiProvider
import pl.sztudio.smarthome.data.api.ArmingRequestDto
import pl.sztudio.smarthome.data.api.ErrorMapper
import pl.sztudio.smarthome.data.api.SztudioApi
import pl.sztudio.smarthome.data.api.parseInstant
import pl.sztudio.smarthome.data.api.toDomain
import pl.sztudio.smarthome.data.local.Snapshot
import pl.sztudio.smarthome.data.local.SnapshotCache
import pl.sztudio.smarthome.domain.model.Alarm
import pl.sztudio.smarthome.domain.model.AlarmSystemState
import pl.sztudio.smarthome.domain.model.ApiTiming
import pl.sztudio.smarthome.domain.model.ArmingMode
import pl.sztudio.smarthome.domain.model.Camera
import pl.sztudio.smarthome.domain.model.ClientError
import pl.sztudio.smarthome.domain.model.CoreStatus
import pl.sztudio.smarthome.domain.model.Diagnostics
import pl.sztudio.smarthome.domain.model.EventQuery
import pl.sztudio.smarthome.domain.model.Sensor
import pl.sztudio.smarthome.domain.model.Session
import pl.sztudio.smarthome.domain.model.SystemEvent
import pl.sztudio.smarthome.domain.repository.MonitoringRepository
import pl.sztudio.smarthome.domain.repository.StreamSignaling
import java.time.Instant

/**
 * Stan systemu pobierany z Sztudio Core. Każdy zasób ma własny [Loadable]: nieudane odświeżenie
 * zostawia poprzednie dane, oznaczone jako nieaktualne. Ostatni stan jest zapisywany w [SnapshotCache].
 */
class MonitoringRepositoryImpl(
    private val apis: ApiProvider,
    private val session: () -> Session?,
    private val cache: SnapshotCache,
    private val scope: CoroutineScope,
    private val now: () -> Instant = Instant::now,
) : MonitoringRepository, StreamSignaling {

    private val _status = MutableStateFlow(Loadable<CoreStatus>())
    private val _cameras = MutableStateFlow(Loadable<List<Camera>>())
    private val _alarms = MutableStateFlow(Loadable<List<Alarm>>())
    private val _sensors = MutableStateFlow(Loadable<List<Sensor>>())
    private val _events = MutableStateFlow(Loadable<List<SystemEvent>>())
    override val status: StateFlow<Loadable<CoreStatus>> = _status.asStateFlow()
    override val cameras: StateFlow<Loadable<List<Camera>>> = _cameras.asStateFlow()
    override val alarms: StateFlow<Loadable<List<Alarm>>> = _alarms.asStateFlow()
    override val sensors: StateFlow<Loadable<List<Sensor>>> = _sensors.asStateFlow()
    override val recentEvents: StateFlow<Loadable<List<SystemEvent>>> = _events.asStateFlow()

    private val _timings = MutableStateFlow<List<ApiTiming>>(emptyList())
    private val _errors = MutableStateFlow<List<ClientError>>(emptyList())
    override val apiTimings: StateFlow<List<ApiTiming>> = _timings.asStateFlow()
    override val clientErrors: StateFlow<List<ClientError>> = _errors.asStateFlow()

    private val snapshotLock = Mutex()
    private var snapshot: Snapshot? = null
    private var persistJob: Job? = null

    fun recordTiming(timing: ApiTiming) = _timings.update { (listOf(timing) + it).take(MAX_TIMINGS) }

    fun recordError(context: String, error: AppError) =
        _errors.update { (listOf(ClientError(now(), context, error.userMessage)) + it).take(MAX_ERRORS) }

    private fun api(): SztudioApi? = session()?.let { apis.forServer(it.serverUrl) }

    /** Wczytuje ostatni zapisany stan danego serwera – dane są oznaczone jako pochodzące z pamięci podręcznej. */
    suspend fun loadCached(serverUrl: String) {
        val saved = cache.load(serverUrl) ?: return
        snapshotLock.withLock { snapshot = saved }
        fun <T> cached(data: T?, at: String?) = if (data == null) null else Loadable(data, parseInstant(at), fromCache = true)
        cached(saved.status?.toDomain(), saved.statusAt)?.let { value -> _status.update { if (it.data == null) value else it } }
        cached(saved.cameras?.map { it.toDomain() }, saved.camerasAt)?.let { value -> _cameras.update { if (it.data == null) value else it } }
        cached(saved.alarms?.map { it.toDomain() }, saved.alarmsAt)?.let { value -> _alarms.update { if (it.data == null) value else it } }
        cached(saved.sensors?.map { it.toDomain() }, saved.sensorsAt)?.let { value -> _sensors.update { if (it.data == null) value else it } }
        cached(saved.events?.map { it.toDomain() }, saved.eventsAt)?.let { value -> _events.update { if (it.data == null) value else it } }
    }

    private suspend fun <D, T> refresh(
        state: MutableStateFlow<Loadable<T>>,
        context: String,
        fetch: suspend (SztudioApi) -> D,
        map: (D) -> T,
        remember: (Snapshot, D, String) -> Snapshot,
    ) {
        val api = api() ?: return
        state.update { it.loading() }
        try {
            val dto = fetch(api)
            val at = now()
            state.value = Loadable.success(map(dto), at)
            val server = session()?.serverUrl ?: return
            snapshotLock.withLock {
                val base = snapshot?.takeIf { it.serverUrl == server } ?: Snapshot(server)
                snapshot = remember(base, dto, at.toString())
            }
            schedulePersist()
        } catch (error: Throwable) {
            val mapped = ErrorMapper.fromThrowable(error)
            recordError(context, mapped)
            state.update { it.failed(mapped) }
        }
    }

    private fun schedulePersist() {
        persistJob?.cancel()
        persistJob = scope.launch {
            delay(1_000)
            snapshotLock.withLock { snapshot }?.let { runCatching { cache.save(it) } }
        }
    }

    override suspend fun refreshStatus() = refresh(_status, "Status systemu", { it.systemStatus() }, { it.toDomain() }) { s, d, at ->
        s.copy(status = d, statusAt = at)
    }

    override suspend fun refreshCameras() = refresh(_cameras, "Kamery", { it.cameras() }, { list -> list.map { it.toDomain() } }) { s, d, at ->
        s.copy(cameras = d, camerasAt = at)
    }

    override suspend fun refreshAlarms() = refresh(_alarms, "Alarmy", { it.alarms(ALARM_LIMIT) }, { list -> list.map { it.toDomain() } }) { s, d, at ->
        s.copy(alarms = d, alarmsAt = at)
    }

    override suspend fun refreshSensors() = refresh(_sensors, "Czujniki", { it.sensors() }, { list -> list.map { it.toDomain() } }) { s, d, at ->
        s.copy(sensors = d, sensorsAt = at)
    }

    override suspend fun refreshRecentEvents() =
        refresh(_events, "Zdarzenia", { it.events(null, null, null, RECENT_EVENTS) }, { list -> list.map { it.toDomain() } }) { s, d, at ->
            s.copy(events = d, eventsAt = at)
        }

    override suspend fun refreshAll() = coroutineScope {
        launch { refreshStatus() }
        launch { refreshCameras() }
        launch { refreshAlarms() }
        launch { refreshSensors() }
        launch { refreshRecentEvents() }
        Unit
    }

    private suspend fun <T> call(context: String, block: suspend (SztudioApi) -> T): Result<T> {
        val api = api() ?: return Result.failure(AppError.SessionExpired)
        return try {
            Result.success(block(api))
        } catch (error: Throwable) {
            val mapped = ErrorMapper.fromThrowable(error)
            recordError(context, mapped)
            Result.failure(mapped)
        }
    }

    override suspend fun acknowledgeAlarm(id: String): Result<Alarm> =
        call("Potwierdzenie alarmu") { it.acknowledgeAlarm(id).toDomain() }.onSuccess { refreshAlarms() }

    override suspend fun setArmingMode(mode: ArmingMode): Result<AlarmSystemState> =
        call("Zmiana trybu uzbrojenia") { it.setArming(ArmingRequestDto(mode.apiValue)).toDomain() }.onSuccess { refreshStatus() }

    override suspend fun events(query: EventQuery): Result<List<SystemEvent>> = call("Historia zdarzeń") { api ->
        api.events(query.category?.apiValue, query.from?.toString(), query.to?.toString(), query.limit).map { it.toDomain() }
    }

    override suspend fun diagnostics(): Result<Diagnostics> = call("Diagnostyka") { it.diagnostics().toDomain() }

    override suspend fun runDiagnostics(): Result<Diagnostics> = call("Kontrola urządzeń") { it.runDiagnostics().toDomain() }

    override suspend fun exchangeOffer(cameraId: String, offerSdp: String): String {
        val api = api() ?: throw AppError.SessionExpired
        return try {
            api.webrtcOffer(cameraId, offerSdp.toRequestBody(SDP)).string()
        } catch (error: Throwable) {
            throw ErrorMapper.fromThrowable(error)
        }
    }

    override suspend fun clear() {
        persistJob?.cancel()
        snapshotLock.withLock { snapshot = null }
        cache.clear()
        _status.value = Loadable()
        _cameras.value = Loadable()
        _alarms.value = Loadable()
        _sensors.value = Loadable()
        _events.value = Loadable()
        _errors.value = emptyList()
        _timings.value = emptyList()
    }

    companion object {
        const val ALARM_LIMIT = 200
        const val RECENT_EVENTS = 20
        private const val MAX_TIMINGS = 50
        private const val MAX_ERRORS = 20
        private val SDP = "application/sdp".toMediaType()
    }
}
