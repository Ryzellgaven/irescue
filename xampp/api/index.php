<?php
declare(strict_types=1);
require_once __DIR__ . '/config.php';

date_default_timezone_set('UTC');
header('Cache-Control: no-store');
if (($_GET['action'] ?? '') === 'health' && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    try {
        database()->query('SELECT 1');
        jsonResponse(['data' => ['status' => 'ok']]);
    } catch (Throwable $e) {
        error_log('[LDRRMO health] ' . $e::class . ': ' . $e->getMessage());
        jsonResponse(['error' => ['message' => 'The database is unavailable.']], 503);
    }
}
$allowedOrigins = array_filter(array_map('trim', explode(',', getenv('LDRRMO_ALLOWED_ORIGINS') ?: 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173')));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$forwardedProto = strtolower(trim(explode(',', $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')[0]));
$requestScheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $forwardedProto === 'https' ? 'https' : 'http';
$requestOrigin = $requestScheme . '://' . ($_SERVER['HTTP_HOST'] ?? '');
if ($origin !== '' && !in_array($origin, $allowedOrigins, true) && $origin !== $requestOrigin) jsonResponse(['error' => ['message' => 'This site is not allowed to access the API.']], 403);
if ($origin !== '') {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token, X-Device-Token');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_name('ldrrmo_xampp_session');
session_set_cookie_params(['lifetime'=>0, 'path'=>'/', 'secure'=>$requestScheme === 'https', 'httponly'=>true, 'samesite'=>'Lax']);
session_start();
try { dispatch(database()); }
catch (Throwable $e) {
    error_log('[LDRRMO API] ' . $e::class . ': ' . $e->getMessage());
    jsonResponse(['error'=>['message'=>'The server could not complete this request. Check the PHP error log.']], 500);
}

function jsonResponse(array $body, int $status = 200): never {
    http_response_code($status); header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE); exit;
}
function ok(mixed $data, int $status = 200): never { jsonResponse(['data'=>$data], $status); }
function fail(string $message, int $status = 422): never { jsonResponse(['error'=>['message'=>$message]], $status); }
function uploadRoot(): string {
    $configured=getenv('LDRRMO_PRIVATE_UPLOAD_DIR');
    if(is_string($configured)&&$configured!=='')return $configured;
    $documentRoot=$_SERVER['DOCUMENT_ROOT']??'';
    if($documentRoot!=='')return dirname($documentRoot).DIRECTORY_SEPARATOR.'ldrrmo-private-uploads';
    $privateBase=getenv('LOCALAPPDATA')?:getenv('HOME')?:dirname(__DIR__);
    return $privateBase.DIRECTORY_SEPARATOR.'ldrrmo-private-uploads';
}
function input(): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 65536) fail('The request body is too large.', 413);
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 65536) fail('The request body is too large.', 413);
    $data = json_decode($raw, true);
    if (!is_array($data)) fail('A valid JSON request body is required.', 400);
    return $data;
}
function text(mixed $value, string $label, int $max = 255, bool $required = true): ?string {
    if (!is_string($value)) { if (!$required && $value === null) return null; fail("{$label} is required."); }
    $value = trim($value);
    if (!$required && $value === '') return null;
    if ($value === '' || mb_strlen($value, 'UTF-8') > $max) fail("{$label} must be between 1 and {$max} characters.");
    return $value;
}
function enumInput(mixed $value, array $allowed, string $label): string {
    if (!is_string($value) || !in_array($value, $allowed, true)) fail("Select a valid {$label}.");
    return $value;
}
function num(mixed $value, float $min, float $max, string $label, bool $nullable = false): ?float {
    if ($nullable && ($value === null || $value === '')) return null;
    if (!is_numeric($value) || !is_finite((float)$value) || (float)$value < $min || (float)$value > $max) fail("{$label} is outside its valid range.");
    return (float)$value;
}
function whole(mixed $value, int $min, int $max, string $label): int {
    $parsed=filter_var($value,FILTER_VALIDATE_INT);
    if($parsed===false||$parsed<$min||$parsed>$max)fail("{$label} must be a whole number between {$min} and {$max}.");
    return $parsed;
}
function csrf(): void {
    if (!isset($_SESSION['csrf_token']) || !hash_equals((string)$_SESSION['csrf_token'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) fail('Your session expired. Refresh and try again.', 403);
}
function profile(PDO $pdo, bool $required = true): ?array {
    if (!isset($_SESSION['user_id'])) { if ($required) fail('Sign in to continue.', 401); return null; }
    $q = $pdo->prepare('SELECT id,email,full_name,phone,address,role,is_active,avatar_url,created_at,updated_at FROM profiles WHERE id=?');
    $q->execute([$_SESSION['user_id']]); $user = $q->fetch();
    if (!$user || !(bool)$user['is_active']) {
        $_SESSION = []; session_regenerate_id(true);
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        if ($required) fail('This account is inactive. Contact an administrator.', 401);
        return null;
    }
    $user['id'] = (int)$user['id']; $user['is_active'] = (bool)$user['is_active'];
    return $user;
}
function requireRole(array $user, array $roles): void { if (!in_array($user['role'], $roles, true)) fail('You are not authorized to perform this action.', 403); }
function audit(PDO $pdo, ?int $userId, string $action, ?string $table = null, int|string|null $record = null, ?array $values = null): void {
    $q = $pdo->prepare('INSERT INTO audit_logs(user_id,action,table_name,record_id,new_values,ip_address) VALUES(?,?,?,?,?,?)');
    $q->execute([$userId,$action,$table,$record === null ? null : (string)$record,$values === null ? null : json_encode($values),substr($_SERVER['REMOTE_ADDR'] ?? 'unknown',0,45)]);
}
function pageParams(): array {
    $page = max(1, min(1000000, (int)($_GET['page'] ?? 1)));
    $size = max(1, min(200, (int)($_GET['per_page'] ?? 50)));
    return [$page,$size,($page-1)*$size];
}
function listQuery(PDO $pdo, string $sql, array $params = []): array { $q=$pdo->prepare($sql); $q->execute($params); return $q->fetchAll(); }
function reportSelect(): string {
    return 'SELECT r.*, p.full_name AS reporter_name,p.phone AS reporter_phone,
            JSON_OBJECT("full_name",p.full_name,"phone",p.phone) AS profiles,
            CASE WHEN a.id IS NULL THEN NULL ELSE JSON_OBJECT("full_name",a.full_name) END AS assigned_profile
            FROM emergency_reports r JOIN profiles p ON p.id=r.reporter_id LEFT JOIN profiles a ON a.id=r.assigned_to';
}
function decodeReport(array $r): array {
    foreach (['profiles','assigned_profile'] as $k) if (isset($r[$k]) && is_string($r[$k])) $r[$k]=json_decode($r[$k],true);
    foreach (['id','reporter_id','assigned_to'] as $k) if (isset($r[$k])) $r[$k]=(int)$r[$k];
    foreach (['latitude','longitude'] as $k) if (isset($r[$k])) $r[$k]=(float)$r[$k];
    $r['is_caller_report']=isset($r['is_caller_report'])?(bool)$r['is_caller_report']:false;
    if (isset($r['address_text'])) $r['location']=$r['address_text'];
    return $r;
}
function dispatch(PDO $pdo): void {
    $action=(string)($_GET['action'] ?? ''); $method=$_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($action==='session' && $method==='GET') {
        $_SESSION['csrf_token'] ??= bin2hex(random_bytes(32));
        $u=profile($pdo,false);
        ok(['authenticated'=>$u!==null,'user'=>$u,'csrf_token'=>$_SESSION['csrf_token']]);
    }
    if ($action==='login' && $method==='POST') { csrf(); login($pdo); }
    if ($action==='register' && $method==='POST') { csrf(); registerResident($pdo); }
    if ($action==='device-reading' && $method==='POST') { ingestReading($pdo); }
    if ($action==='report-media' && $method==='GET') { serveMedia($pdo); }
    $user=profile($pdo);
    if ($method!=='GET') csrf();
    if ($action==='logout' && $method==='POST') {
        audit($pdo,(int)$user['id'],'logout','session');
        $_SESSION=[]; session_regenerate_id(true); $_SESSION['csrf_token']=bin2hex(random_bytes(32));
        ok(['csrf_token'=>$_SESSION['csrf_token']]);
    }
    if ($action==='profile' && $method==='GET') ok($user);
    if ($action==='profile' && $method==='PATCH') { updateSelf($pdo,$user); }
    if ($action==='profiles' && $method==='GET') { requireRole($user,['admin']); listProfiles($pdo); }
    if ($action==='staff-profiles' && $method==='GET') {
        requireRole($user,['ldrrmo_staff','supervisor','admin']);
        ok(listQuery($pdo,"SELECT id,email,full_name,phone,role,is_active,created_at,updated_at FROM profiles WHERE is_active=1 AND role IN ('ldrrmo_staff','supervisor','admin') ORDER BY full_name"));
    }
    if ($action==='users' && $method==='POST') { requireRole($user,['admin']); createUser($pdo,$user); }
    if ($action==='users' && $method==='PATCH') { requireRole($user,['admin']); updateUser($pdo,$user); }
    if ($action==='report-media' && $method==='POST') { uploadMedia($pdo,$user); }
    if ($action==='reports' && $method==='GET') { listReports($pdo,$user); }
    if ($action==='my-reports' && $method==='GET') { listReports($pdo,$user,true); }
    if ($action==='report' && $method==='GET') { getReport($pdo,$user); }
    if ($action==='active-reports' && $method==='GET') {
        $rows=listQuery($pdo,"SELECT id,emergency_type,severity,status,latitude,longitude,address_text,created_at FROM emergency_reports WHERE status IN ('open','in_progress') AND latitude IS NOT NULL ORDER BY created_at DESC LIMIT 200");
        ok(array_map('decodeReport',$rows));
    }
    if ($action==='reports' && $method==='POST') { createReport($pdo,$user); }
    if ($action==='report-status' && $method==='PATCH') { changeStatus($pdo,$user); }
    if ($action==='report-assignments' && $method==='GET') { requireRole($user,['ldrrmo_staff','supervisor','admin']); getAssignments($pdo); }
    if ($action==='report-assignments' && $method==='POST') { requireRole($user,['supervisor','admin']); assignReport($pdo,$user); }
    if ($action==='safe-routes' && $method==='GET') { getSafeRoutes($pdo); }
    if ($action==='safe-routes' && $method==='POST') { requireRole($user,['supervisor','admin']); createSafeRoute($pdo,$user); }
    if ($action==='report-status-history' && $method==='GET') { requireRole($user,['ldrrmo_staff','supervisor','admin']); getStatusHistory($pdo); }
    if ($action==='locations' && $method==='GET') { requireRole($user,['ldrrmo_staff','supervisor','admin']); getLocations($pdo); }
    if ($action==='locations' && $method==='POST') { saveLocation($pdo,$user); }
    if ($action==='evacuation-centers' && $method==='GET') { ok(listQuery($pdo,'SELECT * FROM evacuation_centers ORDER BY name')); }
    if ($action==='evacuation-centers' && in_array($method,['POST','PATCH'],true)) { requireRole($user,['supervisor','admin']); saveCenter($pdo,$user,$method==='PATCH'); }
    if ($action==='iot-devices' && $method==='GET') { requireRole($user,['ldrrmo_staff','supervisor','admin']); listDevices($pdo); }
    if ($action==='iot-devices' && in_array($method,['POST','PATCH'],true)) { requireRole($user,['admin']); saveDevice($pdo,$user,$method==='PATCH'); }
    if ($action==='sensor-readings' && $method==='GET') { requireRole($user,['ldrrmo_staff','supervisor','admin']); getReadings($pdo); }
    if ($action==='notifications' && $method==='GET') { getNotifications($pdo,$user); }
    if ($action==='notifications' && $method==='POST') { requireRole($user,['supervisor','admin']); createNotification($pdo,$user); }
    if ($action==='notification-read' && $method==='POST') { markRead($pdo,$user); }
    if ($action==='caller-logs' && $method==='GET') { requireRole($user,['ldrrmo_staff','supervisor','admin']); listCallerLogs($pdo); }
    if ($action==='caller-logs' && $method==='POST') { requireRole($user,['ldrrmo_staff','supervisor','admin']); createCallerLog($pdo,$user); }
    if ($action==='audit-logs' && $method==='GET') { requireRole($user,['admin']); listAuditLogs($pdo); }
    if ($action==='system-config' && $method==='GET') { requireRole($user,['admin']); ok(listQuery($pdo,'SELECT `key`,value,description,updated_at FROM system_config ORDER BY `key`')); }
    if ($action==='system-config' && $method==='PATCH') { requireRole($user,['admin']); updateConfig($pdo,$user); }
    if ($action==='analytics' && $method==='GET') { requireRole($user,['admin']); analytics($pdo); }
    if ($action==='operations-summary' && $method==='GET') { requireRole($user,['ldrrmo_staff','supervisor','admin']); operationsSummary($pdo); }
    if ($action==='dashboard' && $method==='GET') { requireRole($user,['ldrrmo_staff','supervisor','admin']); legacyDashboard($pdo); }
    if ($action==='sensors' && $method==='POST') { requireRole($user,['admin']); createDeviceLegacy($pdo,$user); }
    fail('Unknown API action.',404);
}

function login(PDO $pdo): never {
    $v=input(); $email=strtolower(trim(is_string($v['email']??null)?$v['email']:'')); $pw=$v['password']??null;
    if (!filter_var($email,FILTER_VALIDATE_EMAIL)||!is_string($pw)||strlen($pw)>4096) fail('Email or password is incorrect.',401);
    $ip=substr($_SERVER['REMOTE_ADDR']??'unknown',0,45);
    $pdo->exec('DELETE FROM login_attempts WHERE attempted_at < UTC_TIMESTAMP() - INTERVAL 1 DAY');
    $rate=$pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip_address=? AND attempted_at>UTC_TIMESTAMP()-INTERVAL 15 MINUTE'); $rate->execute([$ip]);
    if ((int)$rate->fetchColumn()>=10) fail('Too many sign-in attempts. Wait 15 minutes and try again.',429);
    $q=$pdo->prepare('SELECT id,email,full_name,password_hash,role,is_active FROM profiles WHERE email=? LIMIT 1'); $q->execute([$email]); $r=$q->fetch();
    if (!$r||!(bool)$r['is_active']||!password_verify($pw,$r['password_hash'])) {
        $q=$pdo->prepare('INSERT INTO login_attempts(email,ip_address) VALUES(?,?)'); $q->execute([$email,$ip]); fail('Email or password is incorrect.',401);
    }
    $q=$pdo->prepare('DELETE FROM login_attempts WHERE email=? OR ip_address=?'); $q->execute([$email,$ip]);
    session_regenerate_id(true); $_SESSION['user_id']=(int)$r['id']; $_SESSION['csrf_token']=bin2hex(random_bytes(32));
    audit($pdo,(int)$r['id'],'login','session');
    ok(['user'=>['id'=>(int)$r['id'],'email'=>$r['email'],'full_name'=>$r['full_name'],'role'=>$r['role']],'csrf_token'=>$_SESSION['csrf_token']]);
}
function registerResident(PDO $pdo): never {
    $v=input(); $name=text($v['full_name']??null,'Full name',120); $email=strtolower((string)text($v['email']??null,'Email',254));
    if (!filter_var($email,FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address.');
    $pw=$v['password']??null; if (!is_string($pw)||strlen($pw)<8||strlen($pw)>72) fail('Password must be between 8 and 72 bytes.');
    $phone=text($v['phone']??null,'Phone',40); $address=text($v['address']??null,'Address',255);
    try {
        $q=$pdo->prepare("INSERT INTO profiles(email,full_name,phone,address,password_hash,role) VALUES(?,?,?,?,?,'resident')");
        $q->execute([$email,$name,$phone,$address,password_hash($pw,PASSWORD_DEFAULT)]);
    } catch (PDOException $e) { if ((string)$e->getCode()==='23000') fail('An account with that email already exists.',409); throw $e; }
    $id=(int)$pdo->lastInsertId(); session_regenerate_id(true); $_SESSION['user_id']=$id; $_SESSION['csrf_token']=bin2hex(random_bytes(32));
    audit($pdo,$id,'resident_registered','profiles',$id);
    ok(['user'=>['id'=>$id,'email'=>$email,'full_name'=>$name,'role'=>'resident'],'csrf_token'=>$_SESSION['csrf_token']],201);
}
function updateSelf(PDO $pdo,array $u): never {
    $v=input(); $fields=[]; $params=[];
    foreach (['full_name'=>120,'phone'=>40,'address'=>255,'avatar_url'=>500] as $key=>$max) if (array_key_exists($key,$v)) {
        $fields[]="{$key}=?"; $params[]=text($v[$key],$key,$max,$key==='full_name');
    }
    if (!$fields) fail('No profile fields were provided.');
    $params[]=$u['id']; $q=$pdo->prepare('UPDATE profiles SET '.implode(',',$fields).' WHERE id=?'); $q->execute($params);
    audit($pdo,(int)$u['id'],'profile_updated','profiles',(int)$u['id']);
    $q=$pdo->prepare('SELECT id,email,full_name,phone,address,role,is_active,avatar_url,created_at,updated_at FROM profiles WHERE id=?'); $q->execute([$u['id']]); ok($q->fetch());
}
function listProfiles(PDO $pdo): never {
    [$p,$s,$o]=pageParams(); $total=(int)$pdo->query('SELECT COUNT(*) FROM profiles')->fetchColumn();
    $q=$pdo->prepare('SELECT id,email,full_name,phone,address,role,is_active,avatar_url,created_at,updated_at FROM profiles ORDER BY created_at DESC LIMIT ? OFFSET ?');
    $q->bindValue(1,$s,PDO::PARAM_INT);$q->bindValue(2,$o,PDO::PARAM_INT);$q->execute();
    $rows=$q->fetchAll();
    foreach($rows as &$r){$r['id']=(int)$r['id'];$r['is_active']=(bool)$r['is_active'];}
    ok(['items'=>$rows,'total'=>$total]);
}
function createUser(PDO $pdo,array $admin): never {
    $v=input();$email=strtolower((string)text($v['email']??null,'Email',254));if(!filter_var($email,FILTER_VALIDATE_EMAIL))fail('Enter a valid email address.');
    $name=text($v['full_name']??null,'Full name',120);$phone=text($v['phone']??null,'Phone',40,false);
    $role=enumInput($v['role']??null,['resident','ldrrmo_staff','supervisor','admin'],'role');$pw=$v['password']??null;
    if(!is_string($pw)||strlen($pw)<8||strlen($pw)>72)fail('Password must be between 8 and 72 bytes.');
    try{$q=$pdo->prepare('INSERT INTO profiles(email,full_name,phone,password_hash,role) VALUES(?,?,?,?,?)');$q->execute([$email,$name,$phone,password_hash($pw,PASSWORD_DEFAULT),$role]);}
    catch(PDOException $e){if((string)$e->getCode()==='23000')fail('An account with that email already exists.',409);throw $e;}
    $id=(int)$pdo->lastInsertId();audit($pdo,(int)$admin['id'],'user_created','profiles',$id,['role'=>$role]);
    $q=$pdo->prepare('SELECT id,email,full_name,phone,address,role,is_active,avatar_url,created_at,updated_at FROM profiles WHERE id=?');$q->execute([$id]);$r=$q->fetch();$r['id']=$id;$r['is_active']=true;ok($r,201);
}
function updateUser(PDO $pdo,array $admin): never {
    $id=(int)($_GET['id']??0);if($id<1)fail('A valid user ID is required.');
    $v=input();
    if($id===(int)$admin['id'] && array_key_exists('is_active',$v) && !$v['is_active']) fail('You cannot deactivate your own account.',403);
    if($id===(int)$admin['id'] && isset($v['role']) && $v['role']!=='admin') fail('You cannot remove your own administrator role.',403);
    if((isset($v['role'])&&$v['role']!=='admin')||(isset($v['is_active'])&&!$v['is_active'])){
        $q=$pdo->prepare("SELECT role,is_active FROM profiles WHERE id=?");$q->execute([$id]);$target=$q->fetch();
        if($target&&$target['role']==='admin'&&(bool)$target['is_active']&&(int)$pdo->query("SELECT COUNT(*) FROM profiles WHERE role='admin' AND is_active=1")->fetchColumn()<=1)
            fail('The last active administrator cannot be demoted or deactivated.',409);
    }
    $allowed=['full_name','phone','role','is_active'];$fields=[];$params=[];
    foreach($allowed as $k)if(array_key_exists($k,$v)){
        if($k==='role')$params[]=enumInput($v[$k],['resident','ldrrmo_staff','supervisor','admin'],'role');
        elseif($k==='is_active')$params[]=$v[$k]?1:0;
        else $params[]=text($v[$k],$k,$k==='full_name'?120:40,$k==='full_name');
        $fields[]="{$k}=?";
    }
    if(!$fields)fail('No user fields were provided.');
    $params[]=$id;$q=$pdo->prepare('UPDATE profiles SET '.implode(',',$fields).' WHERE id=?');$q->execute($params);
    if(!$q->rowCount()&&!profileExists($pdo,$id))fail('The user does not exist.',404);
    audit($pdo,(int)$admin['id'],'user_updated','profiles',$id);
    $q=$pdo->prepare('SELECT id,email,full_name,phone,address,role,is_active,avatar_url,created_at,updated_at FROM profiles WHERE id=?');$q->execute([$id]);$r=$q->fetch();$r['id']=(int)$r['id'];$r['is_active']=(bool)$r['is_active'];ok($r);
}
function profileExists(PDO $pdo,int $id):bool{$q=$pdo->prepare('SELECT 1 FROM profiles WHERE id=?');$q->execute([$id]);return(bool)$q->fetchColumn();}
function decodeJsonRows(array $rows,array $columns): array {
    foreach($rows as &$row)foreach($columns as $column)if(isset($row[$column])&&is_string($row[$column]))$row[$column]=json_decode($row[$column],true);
    return $rows;
}

function listReports(PDO $pdo,array $u,bool $mine=false): never {
    [$p,$s,$o]=pageParams();$where=[];$params=[];
    if($mine||$u['role']==='resident'){$where[]='r.reporter_id=?';$params[]=$u['id'];}
    foreach(['status'=>['open','in_progress','resolved','closed'],'emergency_type'=>['fire','flood','medical','accident','landslide','earthquake','other'],'severity'=>['low','moderate','high','critical']] as $k=>$opts)
        if(isset($_GET[$k])){$where[]="r.{$k}=?";$params[]=enumInput($_GET[$k],$opts,$k);}
    $clause=$where?' WHERE '.implode(' AND ',$where):'';
    $count=$pdo->prepare('SELECT COUNT(*) FROM emergency_reports r'.$clause);$count->execute($params);$total=(int)$count->fetchColumn();
    $q=$pdo->prepare(reportSelect().$clause.' ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?');
    foreach($params as $i=>$v)$q->bindValue($i+1,$v);$q->bindValue(count($params)+1,$s,PDO::PARAM_INT);$q->bindValue(count($params)+2,$o,PDO::PARAM_INT);$q->execute();
    ok(['items'=>array_map('decodeReport',$q->fetchAll()),'total'=>$total]);
}
function getReport(PDO $pdo,array $u): never {
    $id=(int)($_GET['id']??0);$q=$pdo->prepare(reportSelect().' WHERE r.id=?');$q->execute([$id]);$r=$q->fetch();
    if(!$r)fail('Report not found.',404);if($u['role']==='resident'&&(int)$r['reporter_id']!==(int)$u['id'])fail('You are not authorized to view this report.',403);
    ok(decodeReport($r));
}
function createReport(PDO $pdo,array $u): never {
    $v=input();$type=enumInput($v['emergency_type']??'other',['fire','flood','medical','accident','landslide','earthquake','other'],'emergency type');
    $severity=enumInput($v['severity']??'moderate',['low','moderate','high','critical'],'severity');
    $desc=text($v['description']??null,'Description',5000,false);
    $lat=num($v['latitude']??null,-90,90,'Latitude',true);$lng=num($v['longitude']??null,-180,180,'Longitude',true);
    if(($lat===null)!==($lng===null))fail('Provide both coordinates, or leave both empty.');
    $address=text($v['address_text']??$v['location']??null,'Location',255,false);
    if(!$address && $lat===null)fail('Provide a location or coordinates.');
    $photo=text($v['photo_url']??null,'Photo path',180,false);if($photo!==null&&!stagedMedia($photo,(int)$u['id']))fail('The uploaded photo is invalid.',403);
    $pdo->beginTransaction();
    try {
        $q=$pdo->prepare('INSERT INTO emergency_reports(reporter_id,emergency_type,severity,description,latitude,longitude,address_text,photo_url) VALUES(?,?,?,?,?,?,?,?)');
        $q->execute([$u['id'],$type,$severity,$desc,$lat,$lng,$address,$photo]);$id=(int)$pdo->lastInsertId();
        audit($pdo,(int)$u['id'],'report_created','emergency_reports',$id);
        $title='New Emergency Report: '.ucwords(str_replace('_',' ',$type));
        $location=$lat!==null&&$lng!==null
            ?' at GPS coordinates '.number_format($lat,6,'.','').', '.number_format($lng,6,'.','')
            :($address?' for '.$address:' at an unspecified location');
        $body='A '.$severity.' severity report was submitted'.$location.'.';
        $notify=$pdo->prepare("INSERT INTO notifications(title,body,channel,status,target_role,sent_at) VALUES(?,?,'in_app','sent',?,UTC_TIMESTAMP())");
        foreach(['ldrrmo_staff','supervisor','admin'] as $role)$notify->execute([$title,$body,$role]);
        $pdo->commit();
    } catch(Throwable $e) { if($pdo->inTransaction())$pdo->rollBack(); throw $e; }
    $q=$pdo->prepare(reportSelect().' WHERE r.id=?');$q->execute([$id]);ok(decodeReport($q->fetch()),201);
}
function changeStatus(PDO $pdo,array $u): never {
    requireRole($u,['ldrrmo_staff','supervisor','admin']);$id=(int)($_GET['id']??0);if($id<1)fail('A valid report ID is required.');
    $v=input();$status=enumInput($v['status']??null,['open','in_progress','resolved','closed'],'status');
    if(in_array($status,['resolved','closed'],true))requireRole($u,['supervisor','admin']);
    if(array_key_exists('after_action_report',$v))requireRole($u,['supervisor','admin']);
    $pdo->beginTransaction();
    try{$q=$pdo->prepare('SELECT status,after_action_report FROM emergency_reports WHERE id=? FOR UPDATE');$q->execute([$id]);$current=$q->fetch();if(!$current)fail('The report does not exist.',404);$old=$current['status'];
        $aar=text($v['after_action_report']??null,'After-action report',5000,false);
        if($status==='closed'&&$aar===null&&empty($current['after_action_report']))fail('An after-action report is required before closing an incident.');
        if($old!==$status||$aar!==null){$q=$pdo->prepare('UPDATE emergency_reports SET status=?,after_action_report=COALESCE(?,after_action_report) WHERE id=?');$q->execute([$status,$aar,$id]);}
        if($old!==$status){
            if(in_array($status,['resolved','closed'],true)){
                $q=$pdo->prepare('UPDATE safe_routes SET is_active=0 WHERE report_id=? AND is_active=1');
                $q->execute([$id]);
            }
            $q=$pdo->prepare('INSERT INTO status_updates(report_id,updated_by,old_status,new_status,notes) VALUES(?,?,?,?,?)');
            $q->execute([$id,$u['id'],$old,$status,text($v['notes']??null,'Notes',2000,false)]);
            $recipient=$pdo->prepare('SELECT reporter_id,emergency_type FROM emergency_reports WHERE id=?');$recipient->execute([$id]);$reporter=$recipient->fetch();
            $notify=$pdo->prepare("INSERT INTO notifications(title,body,channel,status,target_user_id,sent_by,sent_at) VALUES(?,?,'in_app','sent',?,?,UTC_TIMESTAMP())");
            $notify->execute(['Report status updated','Your '.str_replace('_',' ',$reporter['emergency_type']).' report status is now '.str_replace('_',' ',$status).'.',$reporter['reporter_id'],$u['id']]);
            audit($pdo,(int)$u['id'],'report_status_changed','emergency_reports',$id,['old_status'=>$old,'new_status'=>$status]);
        }
        $pdo->commit();
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    $q=$pdo->prepare(reportSelect().' WHERE r.id=?');$q->execute([$id]);ok(decodeReport($q->fetch()));
}
function assignReport(PDO $pdo,array $u): never {
    $report=(int)($_GET['id']??0);$v=input();$responder=(int)($v['responder_id']??0);
    $q=$pdo->prepare("SELECT id FROM profiles WHERE id=? AND is_active=1 AND role IN ('ldrrmo_staff','supervisor','admin')");$q->execute([$responder]);if(!$q->fetchColumn())fail('Choose an active staff responder.');
    $pdo->beginTransaction();try{$q=$pdo->prepare('SELECT status FROM emergency_reports WHERE id=? FOR UPDATE');$q->execute([$report]);$old=$q->fetchColumn();if(!is_string($old))fail('The report does not exist.',404);
    $q=$pdo->prepare('INSERT INTO report_assignments(report_id,responder_id,assigned_by,notes) VALUES(?,?,?,?)');$q->execute([$report,$responder,$u['id'],text($v['notes']??null,'Notes',2000,false)]);
    $newStatus=$old==='open'?'in_progress':$old;$q=$pdo->prepare('UPDATE emergency_reports SET assigned_to=?,status=? WHERE id=?');$q->execute([$responder,$newStatus,$report]);
    if($newStatus!==$old){$q=$pdo->prepare('INSERT INTO status_updates(report_id,updated_by,old_status,new_status,notes) VALUES(?,?,?,?,?)');$q->execute([$report,$u['id'],$old,$newStatus,'Responder assigned']);}
    $q=$pdo->prepare("INSERT INTO notifications(title,body,channel,status,target_user_id,sent_by,sent_at) VALUES('Incident assignment','You have been assigned to an emergency response.','in_app','sent',?,?,UTC_TIMESTAMP())");$q->execute([$responder,$u['id']]);
    audit($pdo,(int)$u['id'],'responder_assigned','emergency_reports',$report,['responder_id'=>$responder]);$pdo->commit();}
    catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}ok(['assigned'=>true]);
}
function getAssignments(PDO $pdo): never {
    $id=(int)($_GET['id']??0);ok(decodeJsonRows(listQuery($pdo,'SELECT a.*,JSON_OBJECT("full_name",p.full_name,"role",p.role) AS profiles FROM report_assignments a JOIN profiles p ON p.id=a.responder_id WHERE a.report_id=? ORDER BY a.created_at DESC',[$id]),['profiles']));
}
function decodeSafeRoute(array $route): array {
    $route['id']=(int)$route['id'];
    $route['report_id']=$route['report_id']===null?null:(int)$route['report_id'];
    $route['created_by']=$route['created_by']===null?null:(int)$route['created_by'];
    $route['is_active']=(bool)$route['is_active'];
    $route['path']=json_decode((string)$route['path_json'],true,512,JSON_THROW_ON_ERROR);
    unset($route['path_json']);
    return $route;
}
function getSafeRoutes(PDO $pdo): never {
    $routes=listQuery($pdo,"SELECT s.id,s.report_id,s.title,s.path_json,s.is_active,s.created_by,s.created_at FROM safe_routes s JOIN emergency_reports r ON r.id=s.report_id WHERE s.is_active=1 AND r.status IN ('open','in_progress') ORDER BY s.created_at DESC LIMIT 100");
    ok(array_map('decodeSafeRoute',$routes));
}
function createSafeRoute(PDO $pdo,array $u): never {
    $v=input();
    $reportId=whole($v['report_id']??null,1,PHP_INT_MAX,'Report ID');
    $title=text($v['title']??null,'Route name',160);
    $points=$v['path']??null;
    if(!is_array($points)||count($points)<2||count($points)>100)fail('A route must contain between 2 and 100 map points.');
    $path=[];
    foreach($points as $point){
        if(!is_array($point))fail('Each route point must include valid coordinates.');
        $path[]=[
            'latitude'=>num($point['latitude']??null,-90,90,'Latitude'),
            'longitude'=>num($point['longitude']??null,-180,180,'Longitude'),
        ];
    }
    $q=$pdo->prepare("SELECT emergency_type,status FROM emergency_reports WHERE id=?");
    $q->execute([$reportId]);$report=$q->fetch();
    if(!$report)fail('The report does not exist.',404);
    if($report['emergency_type']!=='landslide')fail('Alternate routes can only be published for landslide reports.');
    if(in_array($report['status'],['resolved','closed'],true))fail('A route cannot be published for a closed report.');

    $pdo->beginTransaction();
    try{
        $q=$pdo->prepare('UPDATE safe_routes SET is_active=0 WHERE report_id=? AND is_active=1');
        $q->execute([$reportId]);
        $q=$pdo->prepare('INSERT INTO safe_routes(report_id,title,path_json,created_by) VALUES(?,?,?,?)');
        $q->execute([$reportId,$title,json_encode($path,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES),$u['id']]);
        $id=(int)$pdo->lastInsertId();
        audit($pdo,(int)$u['id'],'safe_route_published','safe_routes',$id,['report_id'=>$reportId]);
        $pdo->commit();
    }catch(Throwable $e){
        if($pdo->inTransaction())$pdo->rollBack();
        throw $e;
    }
    $q=$pdo->prepare('SELECT id,report_id,title,path_json,is_active,created_by,created_at FROM safe_routes WHERE id=?');
    $q->execute([$id]);ok(decodeSafeRoute($q->fetch()),201);
}
function getStatusHistory(PDO $pdo): never {
    $id=(int)($_GET['id']??0);ok(decodeJsonRows(listQuery($pdo,'SELECT s.*,JSON_OBJECT("full_name",p.full_name) AS profiles FROM status_updates s JOIN profiles p ON p.id=s.updated_by WHERE s.report_id=? ORDER BY s.created_at DESC',[$id]),['profiles']));
}

function saveLocation(PDO $pdo,array $u): never {
    $v=input();$lat=num($v['latitude']??null,-90,90,'Latitude');$lng=num($v['longitude']??null,-180,180,'Longitude');$rid=isset($v['report_id'])?(int)$v['report_id']:null;
    if($rid!==null){$q=$pdo->prepare('SELECT reporter_id FROM emergency_reports WHERE id=?');$q->execute([$rid]);$owner=$q->fetchColumn();if($owner===false)fail('Report not found.',404);if($u['role']==='resident'&&(int)$owner!==(int)$u['id'])fail('You are not authorized to update this report location.',403);}
    $q=$pdo->prepare('INSERT INTO location_updates(user_id,latitude,longitude,report_id) VALUES(?,?,?,?)');$q->execute([$u['id'],$lat,$lng,$rid]);ok(['saved'=>true],201);
}
function getLocations(PDO $pdo): never {
    $q=$pdo->query('SELECT l.* FROM location_updates l JOIN (SELECT user_id,MAX(id) id FROM location_updates GROUP BY user_id) x ON x.id=l.id ORDER BY l.created_at DESC');
    ok($q->fetchAll());
}
function saveCenter(PDO $pdo,array $u,bool $update): never {
    $v=input();$id=(int)($_GET['id']??$v['id']??0);
    if($update){
        $fields=[];$params=[];
        foreach(['name'=>160,'address'=>255,'contact_person'=>120,'contact_number'=>40,'notes'=>5000] as $key=>$max)if(array_key_exists($key,$v)){$fields[]="{$key}=?";$params[]=text($v[$key],$key,$max,$key==='name'||$key==='address');}
        foreach(['latitude'=>[-90,90],'longitude'=>[-180,180]] as $key=>$range)if(array_key_exists($key,$v)){$fields[]="{$key}=?";$params[]=num($v[$key],$range[0],$range[1],$key);}
        foreach(['capacity','current_occupancy'] as $key)if(array_key_exists($key,$v)){$fields[]="{$key}=?";$params[]=whole($v[$key],0,1000000,$key);}
        if(array_key_exists('status',$v)){$fields[]='status=?';$params[]=enumInput($v['status'],['active','inactive'],'status');}
        if(!$fields)fail('No evacuation center fields were provided.');
        if($id<1)fail('A valid evacuation center ID is required.');
        $params[]=$id;$q=$pdo->prepare('UPDATE evacuation_centers SET '.implode(',',$fields).' WHERE id=?');$q->execute($params);
        if(!$q->rowCount()){$q=$pdo->prepare('SELECT id FROM evacuation_centers WHERE id=?');$q->execute([$id]);if(!$q->fetchColumn())fail('Evacuation center not found.',404);}
    }
    else{$name=text($v['name']??null,'Name',160);$address=text($v['address']??null,'Address',255);$q=$pdo->prepare('INSERT INTO evacuation_centers(name,address,latitude,longitude,capacity,current_occupancy,status,contact_person,contact_number,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
        $q->execute([$name,$address,num($v['latitude']??null,-90,90,'Latitude'),num($v['longitude']??null,-180,180,'Longitude'),whole($v['capacity']??0,0,1000000,'Capacity'),whole($v['current_occupancy']??0,0,1000000,'Occupancy'),enumInput($v['status']??'active',['active','inactive'],'status'),text($v['contact_person']??null,'Contact person',120,false),text($v['contact_number']??null,'Contact number',40,false),text($v['notes']??null,'Notes',5000,false),$u['id']]);$id=(int)$pdo->lastInsertId();}
    audit($pdo,(int)$u['id'],$update?'evacuation_center_updated':'evacuation_center_created','evacuation_centers',$id);$q=$pdo->prepare('SELECT * FROM evacuation_centers WHERE id=?');$q->execute([$id]);ok($q->fetch(),$update?200:201);
}
function listDevices(PDO $pdo): never {
    $q=$pdo->query('SELECT d.*,d.last_reading_at,0 AS is_alert FROM iot_devices d ORDER BY d.name');$rows=$q->fetchAll();
    foreach($rows as &$r){$r['id']=(int)$r['id'];$r['latitude']=(float)$r['latitude'];$r['longitude']=(float)$r['longitude'];$r['alert_threshold']=(float)$r['alert_threshold'];$r['last_reading']=$r['last_reading']===null?null:(float)$r['last_reading'];$r['is_alert']=(bool)$r['is_alert'];}
    ok($rows);
}
function saveDevice(PDO $pdo,array $u,bool $update): never {
    $v=input();$id=(int)($_GET['id']??$v['id']??0);
    if($update){
        $fields=[];$params=[];
        if(isset($v['device_code'])){$fields[]='device_code=?';$params[]=text($v['device_code'],'Device code',48);}
        if(isset($v['name'])){$fields[]='name=?';$params[]=text($v['name'],'Sensor name',120);}
        if(isset($v['sensor_type'])){$type=enumInput($v['sensor_type'],['water_level','rainfall','wind_speed','temperature'],'sensor type');$fields[]='sensor_type=?';$params[]=$type;}
        foreach(['latitude'=>[-90,90],'longitude'=>[-180,180]] as $key=>$range)if(isset($v[$key])){$fields[]="{$key}=?";$params[]=num($v[$key],$range[0],$range[1],$key);}
        if(isset($v['alert_threshold'])){$fields[]='alert_threshold=?';$params[]=num($v['alert_threshold'],-1000000,1000000,'Threshold');}
        if(isset($v['alert_unit'])){$fields[]='alert_unit=?';$params[]=text($v['alert_unit'],'Alert unit',12);}
        if(isset($v['status'])){$fields[]='status=?';$params[]=enumInput($v['status'],['active','inactive','maintenance'],'status');}
        if(!$fields)fail('No sensor fields were provided.');
        if($id<1)fail('A valid device ID is required.');
        $params[]=$id;$q=$pdo->prepare('UPDATE iot_devices SET '.implode(',',$fields).' WHERE id=?');$q->execute($params);
        if(!$q->rowCount()){$q=$pdo->prepare('SELECT id FROM iot_devices WHERE id=?');$q->execute([$id]);if(!$q->fetchColumn())fail('IoT device not found.',404);}
    }
    else{$name=text($v['name']??null,'Sensor name',120);$type=enumInput($v['sensor_type']??null,['water_level','rainfall','wind_speed','temperature'],'sensor type');
        $units=['water_level'=>'m','rainfall'=>'mm','wind_speed'=>'m/s','temperature'=>'°C'];$code=isset($v['device_code'])?text($v['device_code'],'Device code',48):'IOT-'.strtoupper(bin2hex(random_bytes(4)));$token=bin2hex(random_bytes(32));
        $unit=isset($v['alert_unit'])?text($v['alert_unit'],'Alert unit',12):$units[$type];$status=enumInput($v['status']??'active',['active','inactive','maintenance'],'status');
        $q=$pdo->prepare('INSERT INTO iot_devices(device_code,name,latitude,longitude,sensor_type,alert_threshold,alert_unit,status,device_token_hash) VALUES(?,?,?,?,?,?,?,?,?)');
        $q->execute([$code,$name,num($v['latitude']??null,-90,90,'Latitude'),num($v['longitude']??null,-180,180,'Longitude'),$type,num($v['alert_threshold']??null,-1000000,1000000,'Threshold'),$unit,$status,hash('sha256',$token)]);$id=(int)$pdo->lastInsertId();
    }
    audit($pdo,(int)$u['id'],$update?'iot_device_updated':'iot_device_created','iot_devices',$id);$q=$pdo->prepare('SELECT * FROM iot_devices WHERE id=?');$q->execute([$id]);$r=$q->fetch();
    foreach(['id'] as $k)$r[$k]=(int)$r[$k];$r['latitude']=(float)$r['latitude'];$r['longitude']=(float)$r['longitude'];$r['alert_threshold']=(float)$r['alert_threshold'];$r['last_reading']=$r['last_reading']===null?null:(float)$r['last_reading'];
    if(!$update)$r['device_token']=$token;ok($r,$update?200:201);
}
function createDeviceLegacy(PDO $pdo,array $u): never { saveDevice($pdo,$u,false); }
function getReadings(PDO $pdo): never {
    $id=(int)($_GET['device_id']??0);$limit=max(1,min(200,(int)($_GET['limit']??50)));
    $q=$pdo->prepare('SELECT * FROM sensor_readings WHERE device_id=? ORDER BY recorded_at DESC,id DESC LIMIT ?');$q->bindValue(1,$id,PDO::PARAM_INT);$q->bindValue(2,$limit,PDO::PARAM_INT);$q->execute();$r=$q->fetchAll();
    foreach($r as &$v){$v['id']=(int)$v['id'];$v['device_id']=(string)$v['device_id'];$v['value']=(float)$v['value'];$v['is_alert']=(bool)$v['is_alert'];}ok($r);
}

function getNotifications(PDO $pdo,array $u): never {
    [$p,$s,$o]=pageParams();$q=$pdo->prepare("SELECT n.*, (nr.id IS NOT NULL) AS is_read FROM notifications n LEFT JOIN notification_reads nr ON nr.notification_id=n.id AND nr.user_id=? WHERE (n.target_user_id=? OR n.target_user_id IS NULL) AND (n.target_role IS NULL OR n.target_role=?) ORDER BY n.created_at DESC LIMIT ? OFFSET ?");
    $q->bindValue(1,$u['id'],PDO::PARAM_INT);$q->bindValue(2,$u['id'],PDO::PARAM_INT);$q->bindValue(3,$u['role']);$q->bindValue(4,$s,PDO::PARAM_INT);$q->bindValue(5,$o,PDO::PARAM_INT);$q->execute();$rows=$q->fetchAll();
    foreach($rows as &$n){$n['id']=(int)$n['id'];$n['is_read']=(bool)$n['is_read'];}
    // Opening the inbox records read receipts for returned notifications.
    $ins=$pdo->prepare('INSERT IGNORE INTO notification_reads(notification_id,user_id) VALUES(?,?)');foreach($rows as $n)$ins->execute([$n['id'],$u['id']]);
    ok($rows);
}
function markRead(PDO $pdo,array $u): never {
    $v=input();$id=(int)($v['notification_id']??0);$q=$pdo->prepare('SELECT id FROM notifications WHERE id=? AND (target_user_id=? OR target_user_id IS NULL) AND (target_role IS NULL OR target_role=?)');$q->execute([$id,$u['id'],$u['role']]);if(!$q->fetchColumn())fail('Notification not found.',404);
    $q=$pdo->prepare('INSERT IGNORE INTO notification_reads(notification_id,user_id) VALUES(?,?)');$q->execute([$id,$u['id']]);ok(['read'=>true]);
}
function createNotification(PDO $pdo,array $u): never {
    $v=input();$title=text($v['title']??null,'Title',180);$body=text($v['body']??null,'Message',10000);
    $channel=enumInput($v['channel']??'in_app',['in_app','push','sms','email'],'channel');
    $role=isset($v['target_role'])&&$v['target_role']!==''?enumInput($v['target_role'],['resident','ldrrmo_staff','supervisor','admin'],'recipient role'):null;
    $target=isset($v['target_user_id'])&&$v['target_user_id']!==''?(int)$v['target_user_id']:null;
    if($target!==null&&!profileExists($pdo,$target))fail('Recipient account not found.');
    if($target!==null&&$role!==null)fail('Choose a user or a role as the recipient, not both.');
    $status=$channel==='in_app'?'sent':'failed';$err=$channel==='in_app'?null:'No '.strtoupper($channel).' delivery provider is configured.';
    $sentAt=$channel==='in_app'?gmdate('Y-m-d H:i:s'):null;
    $q=$pdo->prepare('INSERT INTO notifications(title,body,channel,status,target_role,target_user_id,sent_by,error_message,sent_at) VALUES(?,?,?,?,?,?,?,?,?)');
    $q->execute([$title,$body,$channel,$status,$role,$target,$u['id'],$err,$sentAt]);$id=(int)$pdo->lastInsertId();
    audit($pdo,(int)$u['id'],'notification_dispatched','notifications',$id,['channel'=>$channel,'status'=>$status]);$q=$pdo->prepare('SELECT * FROM notifications WHERE id=?');$q->execute([$id]);ok($q->fetch(),201);
}

function listCallerLogs(PDO $pdo): never {
    [$p,$s,$o]=pageParams();    $q=$pdo->prepare('SELECT c.*,JSON_OBJECT("full_name",p.full_name) AS profiles FROM caller_logs c JOIN profiles p ON p.id=c.logged_by ORDER BY c.created_at DESC LIMIT ? OFFSET ?');$q->bindValue(1,$s,PDO::PARAM_INT);$q->bindValue(2,$o,PDO::PARAM_INT);$q->execute();ok(decodeJsonRows($q->fetchAll(),['profiles']));
}
function createCallerLog(PDO $pdo,array $u): never {
    $v=input();$phone=text($v['caller_phone']??null,'Caller phone',40);$lat=num($v['latitude']??null,-90,90,'Latitude',true);$lng=num($v['longitude']??null,-180,180,'Longitude',true);if(($lat===null)!==($lng===null))fail('Provide both coordinates, or leave both empty.');
    $q=$pdo->prepare('INSERT INTO caller_logs(caller_name,caller_phone,emergency_type,reported_location,latitude,longitude,description,logged_by,report_id) VALUES(?,?,?,?,?,?,?,?,?)');
    $q->execute([text($v['caller_name']??null,'Caller name',120,false),$phone,enumInput($v['emergency_type']??'other',['fire','flood','medical','accident','landslide','earthquake','other'],'emergency type'),text($v['reported_location']??null,'Location',255,false),$lat,$lng,text($v['description']??null,'Description',5000,false),$u['id'],isset($v['report_id'])?(int)$v['report_id']:null]);
    $id=(int)$pdo->lastInsertId();audit($pdo,(int)$u['id'],'caller_log_created','caller_logs',$id);ok(['id'=>$id],201);
}
function listAuditLogs(PDO $pdo): never {
    [$p,$s,$o]=pageParams();$q=$pdo->prepare('SELECT a.*,JSON_OBJECT("full_name",p.full_name,"email",p.email) AS profiles FROM audit_logs a LEFT JOIN profiles p ON p.id=a.user_id ORDER BY a.created_at DESC LIMIT ? OFFSET ?');$q->bindValue(1,$s,PDO::PARAM_INT);$q->bindValue(2,$o,PDO::PARAM_INT);$q->execute();ok(decodeJsonRows($q->fetchAll(),['profiles','new_values','old_values']));
}
function updateConfig(PDO $pdo,array $u): never {
    $key=(string)($_GET['key']??'');if($key==='')fail('A configuration key is required.');
    $v=input();$value=text($v['value']??null,'Value',10000,false);$q=$pdo->prepare('UPDATE system_config SET value=?,updated_by=? WHERE `key`=?');$q->execute([$value??'',$u['id'],$key]);
    if(!$q->rowCount()){$q=$pdo->prepare('SELECT `key` FROM system_config WHERE `key`=?');$q->execute([$key]);if(!$q->fetchColumn())fail('Configuration key not found.',404);}
    audit($pdo,(int)$u['id'],'system_config_updated','system_config',null,['key'=>$key]);ok(['updated'=>true]);
}
function analytics(PDO $pdo): never {
    ok(['reports'=>listQuery($pdo,'SELECT status,emergency_type,severity,created_at FROM emergency_reports ORDER BY created_at DESC LIMIT 5000'),
        'profiles'=>listQuery($pdo,'SELECT role,is_active,created_at FROM profiles ORDER BY created_at DESC LIMIT 5000'),
        'readings'=>listQuery($pdo,'SELECT is_alert,recorded_at FROM sensor_readings ORDER BY recorded_at DESC LIMIT 200')]);
}
function operationsSummary(PDO $pdo): never {
    $counts=['open'=>0,'in_progress'=>0,'resolved'=>0,'total'=>(int)$pdo->query('SELECT COUNT(*) FROM emergency_reports')->fetchColumn()];
    foreach(listQuery($pdo,'SELECT status,COUNT(*) AS n FROM emergency_reports GROUP BY status') as $r)$counts[$r['status']]=(int)$r['n'];
    $q=$pdo->query(reportSelect().' ORDER BY r.created_at DESC LIMIT 5');ok(['reports'=>array_map('decodeReport',$q->fetchAll()),'counts'=>$counts]);
}
function legacyDashboard(PDO $pdo): never {
    $summary=[];
    $summary['active_incidents']=(int)$pdo->query("SELECT COUNT(*) FROM emergency_reports WHERE status IN ('open','in_progress')")->fetchColumn();
    $summary['flood_sensors']=(int)$pdo->query("SELECT COUNT(*) FROM iot_devices WHERE sensor_type='water_level' AND status='active'")->fetchColumn();
    $summary['total_responders']=(int)$pdo->query("SELECT COUNT(*) FROM profiles WHERE is_active=1 AND role IN ('ldrrmo_staff','supervisor','admin')")->fetchColumn();
    $summary['total_reports']=(int)$pdo->query('SELECT COUNT(*) FROM emergency_reports')->fetchColumn();
    $q=$pdo->query(reportSelect().' ORDER BY r.created_at DESC LIMIT 6');$reports=array_map(function($r){$r=decodeReport($r);return ['id'=>$r['id'],'emergency_type'=>$r['emergency_type'],'severity'=>$r['severity'],'status'=>$r['status'],'description'=>$r['description'],'location'=>$r['address_text'],'latitude'=>$r['latitude'],'longitude'=>$r['longitude'],'created_at'=>$r['created_at'],'reporter_name'=>$r['reporter_name']];},$q->fetchAll());
    $q=$pdo->query("SELECT id,emergency_type,severity,status,description,address_text AS location,latitude,longitude,created_at FROM emergency_reports WHERE latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 200");$mapReports=$q->fetchAll();
    foreach($mapReports as &$r){$r['id']=(int)$r['id'];$r['latitude']=(float)$r['latitude'];$r['longitude']=(float)$r['longitude'];}
    $q=$pdo->query('SELECT d.id,d.device_code,d.name,d.sensor_type,d.alert_unit AS unit,d.latitude,d.longitude,d.alert_threshold,d.status,d.last_reading,d.last_reading_at,(d.last_reading>=d.alert_threshold) is_alert FROM iot_devices d ORDER BY d.created_at DESC');
    $sensors=$q->fetchAll();foreach($sensors as &$d){$d['id']=(int)$d['id'];$d['latitude']=(float)$d['latitude'];$d['longitude']=(float)$d['longitude'];$d['alert_threshold']=(float)$d['alert_threshold'];$d['last_reading']=$d['last_reading']===null?null:(float)$d['last_reading'];$d['is_alert']=(bool)$d['is_alert'];}
    foreach($sensors as &$sensor)$sensor['unit']=$sensor['unit']??$sensor['alert_unit'];
    ok(['stats'=>$summary,'reports'=>$reports,'map_reports'=>$mapReports,'sensors'=>$sensors]);
}

function uploadMedia(PDO $pdo,array $u): never {
    if(!isset($_FILES['file'])||$_FILES['file']['error']!==UPLOAD_ERR_OK)fail('Choose a valid image to upload.');
    $f=$_FILES['file'];if($f['size']>5*1024*1024)fail('Photo must be under 5MB.',413);
    $mime=(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);$ext=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','image/gif'=>'gif'][$mime]??null;
    if($ext===null)fail('Only JPEG, PNG, WebP, and GIF images are accepted.');
    $path=(int)$u['id'].'/'.bin2hex(random_bytes(24)).'.'.$ext;
    $root=uploadRoot();
    $dest=$root.DIRECTORY_SEPARATOR.str_replace('/',DIRECTORY_SEPARATOR,$path);
    if(!is_dir(dirname($dest))&&!mkdir(dirname($dest),0700,true))fail('Could not prepare private upload storage.',500);
    if(!move_uploaded_file($f['tmp_name'],$dest))fail('Could not save the uploaded image.',500);
    ok(['path'=>$path],201);
}
function stagedMedia(string $path,int $userId): bool {
    if(!preg_match('#^'.preg_quote((string)$userId,'#').'/[a-f0-9]{48}\.(jpg|png|webp|gif)$#',$path))return false;
    $root=uploadRoot();
    return is_file($root.DIRECTORY_SEPARATOR.str_replace('/',DIRECTORY_SEPARATOR,$path));
}
function ownedMedia(PDO $pdo,string $path,int $userId,bool $allowStaff): bool {
    if(!preg_match('#^[0-9]+/[a-f0-9]{48}\.(jpg|png|webp|gif)$#',$path))return false;
    $q=$pdo->prepare('SELECT reporter_id FROM emergency_reports WHERE photo_url=?');$q->execute([$path]);$owner=$q->fetchColumn();
    return $owner!==false&&((int)$owner===$userId||($allowStaff));
}
function serveMedia(PDO $pdo): never {
    $u=profile($pdo);$path=(string)($_GET['path']??'');
    if(!ownedMedia($pdo,$path,(int)$u['id'],in_array($u['role'],['ldrrmo_staff','supervisor','admin'],true)))fail('File not found.',404);
    $root=uploadRoot();$file=$root.DIRECTORY_SEPARATOR.str_replace('/',DIRECTORY_SEPARATOR,$path);
    if(!is_file($file))fail('File not found.',404);
    $mime=(new finfo(FILEINFO_MIME_TYPE))->file($file);header('Content-Type: '.$mime);header('X-Content-Type-Options: nosniff');header('Content-Disposition: inline');header('Cache-Control: private, no-store');readfile($file);exit;
}
function ingestReading(PDO $pdo): never {
    $v=input();$code=text($v['device_code']??null,'Device code',48);$token=$_SERVER['HTTP_X_DEVICE_TOKEN']??'';
    $reading=num($v['reading']??$v['value']??null,-1000000,1000000,'Reading');if(!is_string($token)||strlen($token)!==64)fail('A valid device token is required.',401);
    $q=$pdo->prepare('SELECT * FROM iot_devices WHERE device_code=? AND status="active"');$q->execute([$code]);$d=$q->fetch();
    if(!$d||!hash_equals($d['device_token_hash'],hash('sha256',$token)))fail('The device credentials are invalid.',401);
    $alert=$reading>=(float)$d['alert_threshold'];$pdo->beginTransaction();
    try{$q=$pdo->prepare('INSERT INTO sensor_readings(device_id,value,unit,is_alert) VALUES(?,?,?,?)');$q->execute([$d['id'],$reading,$d['alert_unit'],$alert?1:0]);
        $q=$pdo->prepare('UPDATE iot_devices SET last_reading=?,last_reading_at=UTC_TIMESTAMP() WHERE id=?');$q->execute([$reading,$d['id']]);
        if($alert){$title='⚠️ Sensor Alert: '.$d['name'];$body='Measured '.$reading.' '.$d['alert_unit'].'; configured threshold is '.$d['alert_threshold'].' '.$d['alert_unit'].'.';
          $q=$pdo->prepare("INSERT INTO notifications(title,body,channel,status,target_role,sent_at) VALUES(?,?,'in_app','sent',?,UTC_TIMESTAMP())");
          foreach(['ldrrmo_staff','supervisor','admin'] as $role)$q->execute([$title,$body,$role]);}
        $pdo->commit();
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    ok(['accepted'=>true,'is_alert'=>$alert]);
}
