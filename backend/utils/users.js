const Models = require('../Models/Schemes')
const {_Users,User} = require('./database')

function auth(req, res, next) {
  const token = req.cookies?.auth_token;
  if (!token) {
    const wantsJson =
      req.path.startsWith("/api") ||
      req.path.startsWith("/dashboard") ||
      req.headers.accept?.includes("application/json") ||
      req.headers["x-requested-with"] === "XMLHttpRequest";
    if (wantsJson) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    return res.redirect("/login");
  }

  _Users.get(token).then(user => {
    if (!user) {
      const wantsJson =
        req.path.startsWith("/api") ||
        req.path.startsWith("/dashboard") ||
        req.headers.accept?.includes("application/json") ||
        req.headers["x-requested-with"] === "XMLHttpRequest";
      if (wantsJson) {
        return res.status(401).json({ error: "UNAUTHORIZED" });
      }
      return res.redirect("/login");
    }
    req.user = user;
    next();
  }).catch(err => {
    console.error("Errore auth:", err);
    const wantsJson =
      req.path.startsWith("/api") ||
      req.path.startsWith("/dashboard") ||
      req.headers.accept?.includes("application/json") ||
      req.headers["x-requested-with"] === "XMLHttpRequest";
    if (wantsJson) {
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
    return res.redirect("/login");
  });
}


function imeiOwnership(req,res,next){

  if(!req.user) return(res.status(403).send({m:'UNAUTHORIZED'}));
  if(!req.body.imei) return(res.status(400).send({error:'BAD_REQUEST', message:"Please specify an imei for this route!"}));
  req.user.vehicles.list().then((data,err) => {
    if (err) {
      console.error('[imeiOwnership] vehicles.list error', err);
      return res.status(500).send({ m: 'INTERNAL_ERROR' });
    }
    var record = data.find(vehicle => vehicle.imei == req.body.imei); 

    if(record) {
      req['vehicle'] = {record, model: Models.getModel(`${record.imei}_monitoring`,Models.avlSchema)}; 
      next();
    }
    else{
      return(res.status(404).send({m:'Vehicle not found.'}))
    }
  }).catch((err) => {
    console.error('[imeiOwnership] vehicles.list exception', err);
    return res.status(500).send({ m: 'INTERNAL_ERROR' });
  });
  
}

function authWS(ws, req, next) {
  const token = req.cookies?.auth_token;
  
  if (!token) {
    ws.close(4001, "Auth mancante");
    return;
  }

  _Users.get(token).then(user => {
    if (!user) {
      ws.close(4002, "Auth fallita");
      return;
    }
    req.user = user;
    next();
  }).catch(err => {
    console.error("Errore auth WS:", err);
    ws.close(1011, "Errore server");
  });
}

module.exports = { auth, authWS,imeiOwnership };
