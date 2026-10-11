/* Transliteration for search only: original names and identifiers are preserved. */
(function(){
  const letters={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',ө:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ү:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'i',ь:'',э:'e',ю:'yu',я:'ya'};
  function normalize(value){return String(value??'').normalize('NFKC').toLowerCase().replace(/[а-яөүё]/g,c=>letters[c]??c).replace(/kh/g,'h').replace(/zh/g,'j').replace(/y(?=[aeou])/g,'y').trim();}
  function matches(value,query){return normalize(value).includes(normalize(query));}
  window.NayadSearch={normalize,matches};
})();
