const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const menu=fs.readFileSync(path.join(root,'profile-menu.js'),'utf8');
const staff=fs.readFileSync(path.join(root,'staff-payroll.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261015051454_employee_attendance.sql'),'utf8');

assert.match(menu,/Ажилтан, цалин/,'hamburger menu must expose staff payroll');
assert.match(menu,/NayadStaff\?\.open/,'menu action must open staff payroll');
assert.match(index,/vendor\/qrcode\.js\?v=1/,'local QR generator must load');
assert.match(index,/staff-payroll\.js\?v=6/,'staff module must load');
assert.match(index,/NayadStaff\?\.isAttendanceRoute/,'normal auth boot must not replace the QR attendance screen');

assert.match(staff,/Ажилдаа ирлээ/);
assert.match(staff,/Ажлаас гарлаа/);
assert.match(staff,/Нэг цагт олгох цалин/);
assert.match(staff,/Сарын цалин/);
assert.match(staff,/staff_employee_sign_in/);
assert.match(staff,/staff_employee_clock/);
assert.match(staff,/enableHighAccuracy:true/,'clock actions must request a fresh high-accuracy position');
assert.match(staff,/NAYAD_STAFF_DEVICE:/,'recognized devices must be remembered locally');
assert.match(staff,/NayadStaff\.detail/,'salary rows must open an employee attendance breakdown');
assert.match(staff,/type="month"/,'employee attendance breakdown must support month selection');
assert.match(staff,/\.eq\('employee_id',employeeId\)/,'attendance details must be scoped to the selected employee');
assert.match(staff,/Ажилласан өдөр/,'attendance details must summarize worked days');
assert.match(staff,/Ирсэн[\s\S]*Гарсан[\s\S]*Ажилласан/,'attendance details must show daily clock-in, clock-out and duration');

for(const table of ['staff_employees','staff_store_settings','staff_attendance']){
  assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`),`${table} must enable RLS`);
}
assert.match(migration,/create table if not exists private\.staff_credentials/,'PIN and device hashes must live outside the exposed public schema');
assert.doesNotMatch(migration,/service_role/,'client feature must not depend on a service-role key');
assert.match(migration,/extensions\.crypt\(p_pin/,'PIN must be hashed');
assert.match(migration,/extensions\.digest\(coalesce\(p_device_token/,'device token must be hashed');
assert.match(migration,/failed_attempts\+1>=5/,'PIN attempts must be rate limited');
assert.match(migration,/staff_distance_m/,'clock actions must validate distance');
assert.match(migration,/p_id is not null and not exists[\s\S]{0,180}e\.store_id=p_store_id/,'an employee edit must remain inside the selected store');
assert.match(migration,/p_lat is null or p_lng is null/,'clock actions must reject missing coordinates');
assert.match(migration,/now\(\) at time zone 'Asia\/Ulaanbaatar'/,'work day must use Mongolia time');
assert.match(migration,/grant execute on function public\.staff_employee_clock[\s\S]*to anon,authenticated/,'only the narrow clock RPC is public');

console.log('staff-payroll: PASS — QR attendance, location checks and wage views are wired securely');
