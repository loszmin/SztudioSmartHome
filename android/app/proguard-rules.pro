# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keep,includedescriptorclasses class pl.sztudio.smarthome.**$$serializer { *; }
-keepclassmembers class pl.sztudio.smarthome.** { *** Companion; kotlinx.serialization.KSerializer serializer(...); }
# Retrofit
-keepattributes Signature, Exceptions
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-keep interface pl.sztudio.smarthome.data.api.** { *; }
# WebRTC (JNI)
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**
