// 3.14 LiveOps admin panel (single page). The HTML lives in admin2.html next to this file.
const fs=require('fs'),path=require('path');let cache=null;
module.exports=function(){if(!cache||process.env.ADMIN_HTML_NOCACHE)cache=fs.readFileSync(path.join(__dirname,'admin2.html'),'utf8');return cache};
