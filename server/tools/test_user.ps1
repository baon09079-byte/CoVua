$conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Database=chess_online;User Id=chess_user;Password=Chess@123456;TrustServerCertificate=True;")
try {
    $conn.Open()
    Write-Output "CONNECTED_WITH_CHESS_USER_SUCCESS!"
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT COUNT(*) FROM Users"
    $count = $cmd.ExecuteScalar()
    Write-Output "Total users in SQL Server chess_online: $count"
    $conn.Close()
} catch {
    Write-Output "FAILED: $($_.Exception.Message)"
}

