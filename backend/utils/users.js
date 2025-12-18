const Models = require('../Models/Schemes')
const {_Users,User} = require('./database')

function auth(req, res, next) {
  const token = req.cookies?.auth_token;
  if (!token) {
    return res.redirect("/login");
  }

  _Users.get(token).then(user => {
    if (!user) return res.redirect("/login");
    req.user = user;
    next();
  }).catch(err => {
    console.error("Errore auth:", err);
    return res.redirect("/login");
  });
}


function imeiOwnership(req,res,next){

  if(!req.user) return(res.status(403).send({m:'UNAUTHORIZED'}));
  if(!req.body.imei) return(res.status(400).send({error:'BAD_REQUEST', message:"Please specify an imei for this route!"}));
  req.user.vehicles.list().then((data,err) => {
    if(!err){
      var record = data.find(vehicle => vehicle.imei == req.body.imei); 

      if(record) {
        req['vehicle'] = {record, model: Models.getModel(`${record.imei}_monitoring`,Models.avlSchema)}; 
        next();
      }
      else{
        return(res.status(404).send({m:'Vehicle not found.'}))
      }
    }
  })
  
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
