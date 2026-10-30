$conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=True;TrustServerCertificate=True;")
$conn.Open()

$cmd = $conn.CreateCommand()
$cmd.CommandText = @"
-- 1. Bật Mixed Mode Authentication nếu cần
EXEC xp_instance_regwrite N'HKEY_LOCAL_MACHINE', N'Software\Microsoft\MSSQLServer\MSSQLServer', N'LoginMode', REG_DWORD, 2;

-- 2. Tạo SQL Login 'chess_user' với mật khẩu 'Chess@123456'
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = 'chess_user')
BEGIN
    CREATE LOGIN chess_user WITH PASSWORD = 'Chess@123456', CHECK_POLICY = OFF;
END
ELSE
BEGIN
    ALTER LOGIN chess_user WITH PASSWORD = 'Chess@123456', CHECK_POLICY = OFF;
    ALTER LOGIN chess_user ENABLE;
END

-- 3. Cấp quyền sysadmin
ALTER SERVER ROLE sysadmin ADD MEMBER chess_user;

-- 4. Tạo User trong database chess_online
USE chess_online;
IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = 'chess_user')
BEGIN
    CREATE USER chess_user FOR LOGIN chess_user;
END
ALTER ROLE db_owner ADD MEMBER chess_user;
"@

$cmd.ExecuteNonQuery()
Write-Output "SUCCESS: SQL Login chess_user created and configured successfully!"
$conn.Close()

