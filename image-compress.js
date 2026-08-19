(function(){
  const MAX_BYTES=2*1024*1024;
  const MAX_SIDE=2000;
  function loadImage(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Зургийг уншиж чадсангүй.'))};img.src=url})}
  async function compress(file){
    if(!file||!file.type.startsWith('image/')||file.size<=MAX_BYTES)return file;
    try{
      const img=await loadImage(file),scale=Math.min(1,MAX_SIDE/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));canvas.height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      let quality=.82,blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));
      while(blob&&blob.size>MAX_BYTES&&quality>.5){quality-=.08;blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality))}
      if(!blob)return file;
      return new File([blob],(file.name||'invoice').replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg',lastModified:Date.now()});
    }catch(error){console.warn('Invoice image compression:',error);return file}
  }
  window.compressInvoiceImage=compress;
})();
