// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { auth } = require('../utils/users')
const { _Users } = require('../utils/database');
const bcrypt = require('bcryptjs');

// Login
router.get('/', (req, res) => {
  return(res.render('index'))
});


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

  return (res.render('auth/login'))
})


router.post('/login', express.urlencoded({ extended: true }), async (req, res) => {
  if (req.user) return (res.redirect('/dashboard'));
  const { username, password } = req.body;
  console.log(req.body)
  var user = await _Users.get(username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.render('auth/login', {
      rParams: { error: 'Email o password errata, riprova per favore.' }
    });
  }
  user.cookie(res, req);
  return (res.redirect('/dashboard'))
})


router.get("/logout", auth, (req, res) => {
  try {
    console.log(req.user)
    req.user.uncookie(res, req);
    return res.redirect("/login");
  } catch (err) {
    console.error("Errore logout:", err);
    return res.redirect("/login");
  }
});



module.exports = router;
