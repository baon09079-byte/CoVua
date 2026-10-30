$conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=True;TrustServerCertificate=True;")
try {
    $conn.Open()
    Write-Output "CONNECTED_MSSQLSERVER"
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT @@VERSION"
    $ver = $cmd.ExecuteScalar()
    Write-Output $ver
    $conn.Close()
} catch {
    Write-Output "MSSQLSERVER_FAILED: $($_.Exception.Message)"
}

$conn2 = New-Object System.Data.SqlClient.SqlConnection("Server=.\SQLEXPRESS;Integrated Security=True;TrustServerCertificate=True;")
try {
    $conn2.Open()
    Write-Output "CONNECTED_SQLEXPRESS"
    $conn2.Close()
} catch {
    Write-Output "SQLEXPRESS_FAILED: $($_.Exception.Message)"
}

