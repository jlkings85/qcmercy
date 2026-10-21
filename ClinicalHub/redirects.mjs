// Preserve old bookmarks and keep ClinicalEvals behind the existing Shifts login.
export default {fetch(request){
 const u=new URL(request.url);
 if(!['GET','HEAD'].includes(request.method))return new Response('Please reopen this page at the new ClinicalApps address before submitting.',{status:409,headers:{'Cache-Control':'no-store'}});
 const origins={'qc.mercyems.net':'https://qc.clinicalapps.app','clinicalshifts.app':'https://shifts.clinicalapps.app'};
 let destination;
 if(origins[u.hostname])destination=origins[u.hostname]+u.pathname+u.search;
 else if(u.hostname==='evals.clinicalapps.app')destination='https://shifts.clinicalapps.app/evaluations/'+u.search;
 else return new Response('Not found',{status:404});
 return new Response(null,{status:302,headers:{Location:destination,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}};
