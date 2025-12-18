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

// === EXPRESS CONFIG ===
app.use("/assets", express.static(path.join(__dirname, '/views/assets')));
app.use("/scripts", express.static(path.join(__dirname, '/node_modules')));

var routes = [
  { location: '/', mw: require('./routes/_home') },
  { location: '/dashboard', mw: require('./routes/_dashboard') },
  { location: '/ws', mw: require('./routes/_websockets') },
  { location: '/api', mw: require('./routes/api') },
];

app.set('view engine', 'ejs');

routes.map((r) => {
  var { location, mw } = r;
  app.use(location, mw);
});

// Avvio server
startDatabases().then((data, err) => {
  if (!err) {
    app.listen(port,"0.0.0.0", () => {
      console.log(`🚀 Server avviato su http://localhost:${port}`);
    });

  }
})
