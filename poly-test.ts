process.binding = function(name) { console.log("intercepted", name); return {}; };
try { process.binding("tcp_wrap"); console.log("success"); } catch(e) { console.log(e); }
