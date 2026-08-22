(function(){
  function render(){
    try{
      if(typeof sync==='function')sync();
      const content=document.getElementById('content');
      if(!content)return;
      let html='';
      if(page==='companies')html=companies();
      else if(page==='payments')html=payments();
      else if(page==='loans')html=loans();
      else if(page==='reports')html=reports();
      else html=home();
      content.innerHTML=html;
      document.querySelectorAll('.nav').forEach(function(b){b.classList.toggle('active',b.dataset.page===page)});
      if(typeof updateProfileUI==='function')updateProfileUI();
    }catch(e){
      console.error('NAYAD render error:',e);
      const content=document.getElementById('content');
      if(content)content.innerHTML='<div class="card" style="margin-top:20px"><b>NAYAD ачаалахад алдаа гарлаа.</b><div class="sub">Аппыг хаагаад дахин нээнэ үү.</div></div>';
    }
  }
  window.render=render;
})();
