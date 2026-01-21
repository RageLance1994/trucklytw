const express = require('express');
// const livereload = require('livereload');
// const connectLivereload = require('connect-livereload');
const path = require('path');
require('dotenv').config()
const {startDatabases} =  require('./utils/database')
const fileUpload = require('express-fileupload');
const app = express();
const compression = require('compression')
app.use(compression({ level: 6, threshold: 1024,brotli:true  }));
app.use((req, res, next) => {
  res.setHeader('Connection', 'keep-alive');
  next();

})


const cookieParser = require('cookie-parser');

const port = process.env.PORT || 8080;

console.log(`Process port is ${process.env.PORT}, backup port is ${port}`); 


const corsAllowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && corsAllowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With",
    );
  }
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});




//Middlewares
// app.use(connectLivereload());
app.use(cookieParser());
// parse JSON and urlencoded before touching multipart to keep simple forms working everywhere (Safari)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload()); 
app.enable('trust proxy');


var expressWs = require('express-ws')(app);



// Refresh automatico al primo collegamento
// liveReloadServer.server.once("connection", () => {
//   setTimeout(() => {
//     liveReloadServer.refresh("/");
//   }, 100);
// });

const isProduction = process.env.NODE_ENV === "production" || !!process.env.K_SERVICE;
const distPath = path.join(__dirname, "dist");

var routes = [
  { location: '/', mw: require('./routes/_home') },
  { location: '/dashboard', mw: require('./routes/_dashboard') },
  { location: '/ws', mw: require('./routes/_websockets') },
  { location: '/api', mw: require('./routes/api') },
];

if (isProduction) {
  // Keep "/" mounted so auth endpoints like /login still work in prod.
  routes = routes.filter((r) => !['/dashboard'].includes(r.location));
}



routes.map((r) => {
  var { location, mw } = r;
  app.use(location, mw);
});

if (isProduction) {
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.sendStatus(404);
    }
    return res.sendFile(path.join(distPath, "index.html"));
  });
}

// Avvio server
startDatabases().then((data, err) => {
  if (!err) {
    app.listen(port,"0.0.0.0", () => {
      console.log(`🚀 Server avviato su http://localhost:${port}`);
    });

  }
})
