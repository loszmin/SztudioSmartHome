package pl.sztudio.smarthome.presentation.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pl.sztudio.smarthome.presentation.theme.Sz

/** Sygnet Sztudio – geometryczne „S” (ten sam rysunek co w panelu WWW, siatka 48×48). */
@Composable
fun LogoMark(size: Dp, modifier: Modifier = Modifier) {
    Canvas(modifier.size(size).semantics { contentDescription = "Sztudio" }) {
        val unit = this.size.minDimension / 48f
        fun path(vararg points: Pair<Float, Float>) = Path().apply {
            points.forEachIndexed { index, (x, y) -> if (index == 0) moveTo(x * unit, y * unit) else lineTo(x * unit, y * unit) }
        }
        val stroke = Stroke(width = 6 * unit, join = StrokeJoin.Miter)
        drawPath(
            path(38f to 11f, 16f to 11f, 10f to 17f, 10f to 20f, 14f to 24f, 24f to 24f),
            Brush.linearGradient(listOf(Color(0xFFE6ECF4), Color(0xFF93A3B8))),
            style = stroke,
        )
        drawPath(
            path(10f to 37f, 32f to 37f, 38f to 31f, 38f to 28f, 34f to 24f, 24f to 24f),
            Brush.linearGradient(listOf(Color(0xFF4BA3F5), Color(0xFF1B6FC7))),
            style = stroke,
        )
    }
}

@Composable
fun SztudioLogo(modifier: Modifier = Modifier, markSize: Dp = 40.dp, tagline: Boolean = false, large: Boolean = false) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(if (large) 16.dp else 12.dp)) {
        LogoMark(markSize)
        Column {
            Text("SZTUDIO", color = Sz.Ink, fontWeight = FontWeight.Bold, fontSize = if (large) 26.sp else 16.sp, letterSpacing = 3.sp)
            Spacer(Modifier.height(2.dp))
            Text("SMART HOME", color = Sz.BlueSoft, fontWeight = FontWeight.SemiBold, fontSize = if (large) 13.sp else 10.sp, letterSpacing = 4.sp)
            if (tagline) {
                Spacer(Modifier.height(6.dp))
                Text("YOUR HOME. YOUR SECURITY.", color = Sz.Muted, fontSize = if (large) 11.sp else 9.sp, letterSpacing = 1.6.sp)
            }
        }
    }
}
