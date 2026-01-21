// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const path = require('path');

const { auth } = require('../utils/users')
const { _Users } = require('../utils/database');
const bcrypt = require('bcryptjs');

// Login

router.get('/', (req, res, next) => {
  const isProduction = process.env.NODE_ENV === "production" || !!process.env.K_SERVICE;
  if (isProduction) {
    return res.sendFile(path.join(__dirname, "..", "dist", "index.html"));
  }
  return res.render('index');

})


router.get('/preview/:template',async(req,res) => {
  console.log(req.params)
  return(res.render(`wrappers/overlays/${req.params.template}`))
})



router.post('/register', (req, res) => {
  const { email, password } = req.body;
  res.json({ message: `Utente ${email} registrato` });
});


router.get('/login', (req, res) => {
  if(req.cookies && req.cookies.auth_token){
    return(res.redirect('/dashboard'))
  }
  if (req.user) return (res.redirect('/dashboard'));

  const isProduction = process.env.NODE_ENV === "production" || !!process.env.K_SERVICE;
  if (isProduction) {
    return res.sendFile(path.join(__dirname, "..", "dist", "index.html"));
  }
  return (res.render('auth/login'))
})


router.post('/login', express.urlencoded({ extended: true }), async (req, res) => {
  if (req.user) return (res.redirect('/dashboard'));
  const { username, password } = req.body;
  console.log(req.body)
  var user = await _Users.get(username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    const isProduction = process.env.NODE_ENV === "production" || !!process.env.K_SERVICE;
    if (isProduction) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }
    return res.render('auth/login', {
      rParams: { error: 'Email o password errata, riprova per favore.' }
    });
  }
  user.cookie(res, req);
  const isProduction = process.env.NODE_ENV === "production" || !!process.env.K_SERVICE;
  if (isProduction) {
    return res.status(200).json({ ok: true });
  }
  return (res.redirect('/dashboard'))
})


router.get("/logout", (req, res) => {
  try {
    const wantsJson =
      req.headers.accept?.includes("application/json") ||
      req.headers["x-requested-with"] === "XMLHttpRequest";
    if (req.user?.uncookie) {
      req.user.uncookie(res, req);
    } else {
      res.clearCookie('auth_token', {
        httpOnly: true,
        secure: !!(req?.secure || req?.headers?.['x-forwarded-proto'] === 'https'),
        sameSite: 'lax',
        path: '/'
      });
    }
    if (wantsJson) {
      return res.status(200).json({ ok: true });
    }
    return res.redirect("/login");
  } catch (err) {
    console.error("Errore logout:", err);
    return res.redirect("/login");
  }
});



module.exports = router;
