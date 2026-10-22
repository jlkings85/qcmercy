export const navigation=String.raw`(()=>{
 if(window.__qcEducationNavigationV2)return;
 window.__qcEducationNavigationV2=true;
 let required=0,scheduled=false,loading=false;
 const title=()=>required?'Required education ('+required+')':'Documents & Education';
 const icon='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 7v14M3 3h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5v17h-5a4 4 0 0 0-4 1 4 4 0 0 0-4-1H3z"/></svg>';
 function link(){const a=document.createElement('a');a.href='/education';a.setAttribute('data-qc-education-link','');a.innerHTML=icon+'<span></span>';a.querySelector('span').textContent=title();return a}
 function mount(){
  scheduled=false;
  const sidebars=document.querySelectorAll('[data-sidebar="content"]');
  for(const sidebar of sidebars){const menu=sidebar.querySelector('[data-sidebar="menu"]');if(!menu||menu.querySelector('[data-qc-education-link]'))continue;
   const li=document.createElement('li');li.setAttribute('data-sidebar','menu-item');li.setAttribute('data-slot','sidebar-menu-item');li.className='group/menu-item relative';
   const a=link(),sample=menu.querySelector('[data-sidebar="menu-button"]');a.className=sample?.className||'';a.setAttribute('data-sidebar','menu-button');a.setAttribute('data-slot','sidebar-menu-button');a.setAttribute('data-active','false');a.style.cssText='display:flex;align-items:center;gap:8px;padding:8px;width:100%;text-decoration:none;color:inherit;min-height:36px';li.append(a);menu.append(li);
  }
  // Keep mobile access outside the collapsible drawer. The link is available even if badge loading fails.
  if(document.querySelector('[data-slot="sidebar-wrapper"]')&&!document.getElementById('qc-education-link')){
   const a=link();a.id='qc-education-link';a.style.cssText='position:fixed;bottom:16px;right:16px;z-index:1000;padding:12px 16px;border-radius:8px;background:#155b85;color:white;text-decoration:none;font:600 14px system-ui;box-shadow:0 2px 8px #0003;align-items:center;gap:8px';document.body.append(a);
   if(!document.getElementById('qc-education-link-style')){const style=document.createElement('style');style.id='qc-education-link-style';style.textContent='#qc-education-link{display:none}@media(max-width:767px){#qc-education-link{display:flex}}';document.head.append(style)}
  }
  for(const a of document.querySelectorAll('[data-qc-education-link]')){const label=a.querySelector('span');if(label.textContent!==title())label.textContent=title();}
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(mount)}}
 async function refreshBadge(){if(loading)return;loading=true;try{const r=await fetch('/api/education',{cache:'no-store'});if(r.ok){const d=await r.json();required=Array.isArray(d.assignments)?d.assignments.filter(x=>x.effective_state==='assigned').length:0;}}catch{}finally{loading=false;schedule()}}
 function start(){mount();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});refreshBadge();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){schedule();refreshBadge()}});
})();`;
