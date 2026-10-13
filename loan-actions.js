(function(){
 'use strict';const B=window.NayadLoanEditorBridge;if(!B)return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let root=null,ctx=null,busy=false,focus=null;
 function toggle(el,open){if(!el)return;const next=open??!el.classList.contains('revealed');document.querySelectorAll('.loanSwipe.revealed').forEach(x=>{x.classList.remove('revealed');x.querySelector('.loanSwipeActions').inert=true;x.querySelector('.loanMore')?.setAttribute('aria-expanded','false');});el.classList.toggle('revealed',next);el.querySelector('.loanSwipeActions').inert=!next;el.querySelector('.loanMore')?.setAttribute('aria-expanded',String(next));}
 function close(){if(busy)return;root?.remove();root=null;ctx=null;document.body.classList.remove('loanFormOpen');focus?.focus?.();}
 function open(action,id,rowId){
  if(busy||!B.canManage())return;const loan=B.find(id),row=loan?.installments.find(x=>String(x.id)===String(rowId));if(!loan)return;
  if(action==='reverse'&&row?.status!=='paid')return;
  if(action==='delete'&&(loan.has_payment_history||loan.installments.some(r=>r.status==='paid'||Number(r.paid_amount)>0)))return window.toast?.('Төлөлтийн түүхтэй зээлийг устгахгүй. Зээл хаахыг ашиглана уу.');
  window.closeSheet?.();close();focus=document.activeElement;ctx={action,id,rowId,revision:loan.schedule_revision,store:B.storeId(),user:window.__nayadUser?.id};
  const title={delete:'Зээл устгах',close:'Зээл хаах',reverse:'Төлсөн тэмдэглэгээг буцаах'}[action];if(!title)return;
  const description=action==='delete'?'Энэ зээлийн мэдээлэл, хуваарь, хавсралтыг устгана. Батлахын тулд «устгах» гэж бичнэ үү.':action==='close'?'Зээл хаагдсан хэсэгт шилжинэ. Төлөөгүй үлдэгдэл болон түүх хадгалагдана; төлсөн гэж тэмдэглэхгүй.':`${row.installment_number}-р төлөлт төлөөгүй төлөвт буцаж, үлдэгдэл шинэчлэгдэнэ. Энэ нь банкны мөнгөн шилжүүлгийг буцаахгүй.`;
  root=document.createElement('div');root.id='loanActionOverlay';root.className='loanContractOverlay';root.innerHTML=`<section class="loanContractDialog" role="dialog" aria-modal="true" aria-labelledby="loanActionTitle"><header><h2 id="loanActionTitle">${title}</h2><button data-dismiss aria-label="Хаах">×</button></header><div class="loanContractBody"><h3>${esc(loan.lender_name)}</h3><p>${description}</p>${action==='delete'?'<label class="contractField"><span>Баталгаажуулах үг</span><input id="loanDeleteWord" autocomplete="off" placeholder="устгах"></label>':''}<p role="alert"></p></div><footer><button class="primary full" data-submit ${action==='delete'?'disabled':''}>${title}</button><button class="secondary full" data-dismiss style="margin-top:8px">Болих</button></footer></section>`;
  document.body.appendChild(root);document.body.classList.add('loanFormOpen');root.addEventListener('input',()=>{root.querySelector('[data-submit]').disabled=root.querySelector('input')?.value.trim().toLowerCase()!=='устгах';});root.addEventListener('click',e=>{if(e.target.closest('[data-dismiss]'))close();if(e.target.closest('[data-submit]'))save();});root.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const ns=[...root.querySelectorAll('button,input')].filter(n=>!n.disabled),a=ns[0],z=ns.at(-1);if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus();}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}}});root.querySelector('input,button').focus();
 }
 async function save(){
  if(busy||!ctx)return;const error=s=>{if(root)root.querySelector('[role=alert]').textContent=s;};
  if(ctx.store!==B.storeId()||ctx.user!==window.__nayadUser?.id||!B.canManage())return error('Дэлгүүр эсвэл хэрэглэгч өөрчлөгдсөн байна. Дахин нээнэ үү.');
  const word=root.querySelector('input')?.value.trim().toLowerCase();if(ctx.action==='delete'&&word!=='устгах')return;
  busy=true;root.querySelectorAll('button,input').forEach(n=>n.disabled=true);window.__nayadCriticalOperation='loan-action';
  try{
   const {data,error:e}=await B.client().rpc('manage_loan_action',{p_store_id:ctx.store,p_loan_id:ctx.id,p_revision:ctx.revision,p_action:ctx.action,p_installment_id:ctx.rowId||null,p_confirmation:word||null});if(e)throw e;
   let cleanupFailed=false;if(data?.paths?.length){try{const result=await B.client().storage.from('loan-contracts').remove(data.paths);cleanupFailed=!!result.error;}catch(_){cleanupFailed=true;}}
   busy=false;close();await B.sync();window.render?.();window.toast?.(cleanupFailed?'Зээл устсан. Хавсралтын файлыг цэвэрлэхэд алдаа гарлаа.':'Өөрчлөлт хадгалагдлаа.');
  }catch(e){error(e.message||'Алдаа гарлаа.');}finally{busy=false;root?.querySelectorAll('button,input').forEach(n=>n.disabled=false);if(window.__nayadCriticalOperation==='loan-action')delete window.__nayadCriticalOperation;}
 }
 let gesture=null,suppressUntil=0;
 document.addEventListener('pointerdown',e=>{const el=e.target.closest('.loanSwipe');if(el&&e.pointerType!=='mouse'&&!e.target.closest('button'))gesture={el,x:e.clientX,y:e.clientY};});
 document.addEventListener('pointerup',e=>{if(!gesture)return;const g=gesture;gesture=null;const dx=e.clientX-g.x,dy=e.clientY-g.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5){toggle(g.el,dx<0);suppressUntil=Date.now()+400;}});
 document.addEventListener('pointercancel',()=>gesture=null);
 document.addEventListener('click',e=>{if(Date.now()<suppressUntil&&e.target.closest('.loanSwipe')){e.preventDefault();e.stopImmediatePropagation();return;}const edit=e.target.closest('[data-loan-edit]'),del=e.target.closest('[data-loan-delete]');if(edit){toggle(edit.closest('.loanSwipe'),false);window.showLoanEdit?.(edit.dataset.loanEdit);}if(del)open('delete',del.dataset.loanDelete);},true);
 window.NayadLoanActions={open,close,toggle};
})();
