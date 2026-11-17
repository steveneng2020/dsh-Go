// Run with the repository's unchanged PhoneToolCatalog.kt and Json.kt.
import dsh.android.go.phone.PhoneToolCatalog
import dsh.android.go.phone.Json
fun main() { print(Json.write(PhoneToolCatalog.listJson())) }
