/* Pure staff time calculations. All wall-clock input is Mongolia time (UTC+08). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NayadStaffTime=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 const minutes=value=>{if(!/^\d{2}:\d{2}(:\d{2})?$/.test(value||''))return NaN;const [h,m]=value.split(':').map(Number);return h<24&&m<60?h*60+m:NaN;};
 function span(start,end){const a=minutes(start),b=minutes(end);if(!Number.isFinite(a+b)||a===b)return null;return ((b-a+1440)%1440)*60;}
 function shift(date,start,end){const seconds=span(start,end);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||seconds===null)return null;const from=new Date(`${date}T${start.slice(0,5)}:00+08:00`);if(!Number.isFinite(+from))return null;return {from,to:new Date(+from+seconds*1000),seconds,overnight:minutes(end)<minutes(start)};}
 function schedule(history,id,date){return history.filter(h=>h.employee_id===id&&h.effective_from<=date).sort((a,b)=>b.effective_from.localeCompare(a.effective_from)||b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id))[0];}
 function pay(row){if(row.approval_status!=='approved'||!row.wage_snapshot||row.wage_snapshot.type!=='hourly')return 0;const w=row.wage_snapshot;return ((row.approved_seconds-row.overtime_seconds)+row.overtime_seconds*Number(w.multiplier||1))/3600*Number(w.rate||0);}
 function payDates(year,month,days){const last=new Date(Date.UTC(year,month,0)).getUTCDate();return [...new Set(days.map(d=>d===0?last:Math.min(d,last)))].sort((a,b)=>a-b);}
 function lateAmount(r,mins){if(!r?.enabled||mins<=Number(r.grace||0))return 0;const units=(mins-(r.basis==='all'?0:Number(r.grace||0)))/Math.max(1,Number(r.interval)||1);let amount=(r.rounding==='ceil'?Math.ceil(units):Math.floor(units))*Number(r.amount||0);if(r.cap!=null)amount=Math.min(amount,Number(r.cap));return Math.max(0,Math.round(amount*100)/100);}
 function deduction(r){return r.approval_status==='approved'?Math.max(0,Number(r.wage_snapshot?.late_deduction)||0):0;}
 return {lateAmount,deduction,minutes,span,shift,schedule,pay,payDates};
});
