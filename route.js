const route = require("express").Router();

const register_Schema = require("./modules/register_Schema");
const bcard_Schema = require("./modules/bcard_Schema");
const contactMe_Schema = require("./modules/contact-me");

const multer = require("multer");
const bcrypt = require("bcrypt");

const fs = require("fs");
const { promisify } = require("util");
const unlinkAsync = promisify(fs.unlink);

const email_tester =
  /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

let storage = multer.diskStorage({
  destination: "./public/uploads",
  filename: function (req, file, cb) {
    cb(null, req.body.bemail + "-" + req.body.lname + "-" + file.originalname);
  },
});

let upload = multer({ storage: storage });

route.use(async (req, res, next) => {
  const { user_key } = req.cookies;
  if (typeof user_key != "undefined") {
    await register_Schema
      .findOne({ user_key })
      .then((data) => {
        if (data != null) {
          res.locals.key = data.user_key;
          res.locals.email = data.email;
          res.locals.username = data.email.split('@')[0];
        } else {
          res.clearCookie("user_key");
          res.locals.email = 'undefined';
          res.locals.username = 'undefined';
        }
      })
      .catch(() => res.redirect('/error'));
    await bcard_Schema.findOne({ user_key: res.locals.key }).then((data) => {
      res.locals.bcard = data != null ? "exist" : "not exist";
    });
  } else {
    res.locals.email = 'undefined';
    res.locals.username = 'undefined';
    res.locals.bcard = 'undefined';
  }
  next();
});

route.use(['/', '/dashboard'], (req, res, next) => {
  if(res.locals.bcard == 'exist'){
    const { rateme } = req.cookies;
    if(typeof rateme == 'undefined'){
      // send cookie & rate me pop up
      res.cookie("rateme", 'not yet', {
        maxAge: 86400000 * 7,
        httpOnly: true,
      });
      res.locals.rateme = true;
    } else {
      res.locals.rateme = true;
    }
  }
  next()
})

route.get("/", async (req, res) => {
  res.render("ejs/home");
});

route.post('/', (req, res) => {
  const email = new contactMe_Schema({
    phone: req.body.phone,
    message: req.body.message
  })
  email.save()
    .then(() => {
      res.json('success')
    })
    .catch(() => res.redirect('/error'));
})

route.get("/signup", (req, res) => {
  if (res.locals.email != "undefined") {
    return res.redirect("/");
  } else {
    return res.render("ejs/signup", { inp_email: 'undefined' });
  }
});
route.post("/signup", (req, res) => {
  const { email, password } = req.body;
  if (!email_tester.test(email)) {
    res.render("ejs/signup", {
      EmailErr: "מייל לא תקין",
      inp_email: email,
      password,
    });
    return;
  }
  register_Schema
    .findOne({ email })
    .then((data) => {
      if (data == null) {
        const newUser = new register_Schema({
          email,
          password,
          user_key:
            email + "000" + (Math.random() + 1).toString(36).substring(7),
        });
        bcrypt.genSalt(10, (err, salt) => {
          bcrypt.hash(newUser.password, salt, (err, hash) => {
            if (err) throw err;
            newUser.password = hash;
            newUser
              .save()
              .then((data) => {
                res.cookie("user_key", data.user_key, {
                  maxAge: 253402300000000,
                  httpOnly: true,
                });
                res.redirect("/");
              })
              .catch(() => res.redirect('/error'));
          });
        });
      } else {
        bcrypt.compare(password, data.password, (err, isMatch) => {
          if (isMatch) {
            res.cookie("user_key", data.user_key, {
              maxAge: 253402300000000,
              httpOnly: true,
            });
            res.redirect("/");
          } else {
            res.render("ejs/signup", {
              PassErr: "הסיסמא לא נכונה",
              inp_email: email,
            });
          }
        });
      }
    })
    .catch((err) => res.redirect('/error'));
});
route.get("/create", (req, res) => {
  if (res.locals.email == "undefined" || res.locals.bcard == "exist") {
    return res.redirect("/");
  } else {
    return res.render("ejs/createCard");
  }
});
route.post(
  "/create",
  (req, res, next) => {
    if (res.locals.email != "undefined") {
      next();
    } else {
      res.render('ejs/fail', { errStatus: 'undefined', err: "you disconnected from you account"});
    }
  },
  upload.single("logo"),
  async (req, res) => {
    const {
      lname,
      bname,
      description,
      bemail,
      btel,
      whatsapp,
      tlocation,
      llocation,
      facebook_username,
      facebook_link,
      instagram_username,
      instagram_link,
      twitter_username,
      twitter_link,
      tiktok_username,
      tiktok_link,
      bcard_type,
    } = req.body;

    let existData;
    let findLname = bcard_Schema
      .findOne({ lname })
      .then((data) => (existData = data))
      .catch((err) => res.redirect('/error'));
    await findLname;
    if (existData != null) {
      await unlinkAsync(`./public/uploads/${req.file.filename}`);
      return res.render("ejs/fail", {
        err: "כרטיס זה כבר קיים במערכת, תוכל למצוא אותו ב:",
        link: existData.lname,
        errStatus: "undefined",
      });
    }

    if (checkValidation(req.body) == true) {
      if (res.locals.email == "undefined") {
        unlinkAsync(`./public/uploads/${req.file.filename}`);
        return res.send("user is not connected");
      } else {
        bcard_Schema.findOne({ user_key: res.locals.key }).then((data) => {
          if (data == null) {
            const new_bcard_Schema = new bcard_Schema({
              user_key: res.locals.key,
              lname,
              bname,
              description,
              btel,
              bcard_type,
              bemail,
              whatsapp,
              facebook_username,
              facebook_link,
              instagram_username,
              instagram_link,
              twitter_username,
              twitter_link,
              tiktok_username,
              tiktok_link,
              tlocation,
              llocation,
              logo_location: req.file.filename,
              colors: set_colors(bcard_type)
            });
            new_bcard_Schema
              .save()
              .then((data) => {
                res.redirect("/dashboard?firstime=true");
              })
              .catch((err) => {
                unlinkAsync(`./public/uploads/${req.file.filename}`);
                res.redirect('/error')
              });
          } else {
            unlinkAsync(`./public/uploads/${req.file.filename}`);
            res.render("ejs/fail", {
              err: "כרטיס ביקור כבר קיים בבעלותך",
              errStatus: "undefined",
            });
          }
        });
      }
    } else {
      unlinkAsync(`./public/uploads/${req.file.filename}`);
      res.send(fail_message);
    }
  }
);
function set_colors(bcard){
  let colors = {}
  switch(bcard.toLowerCase()){
    case 'classic':
      colors.color = '#000';
      colors.bg = '#ddd';
      colors.special_color = '#ddd';
      colors.special_bg = 'rgb(24, 24, 24)';
      break;
    case 'smooth':
      colors.color = '#ddd';
      colors.bg = 'rgb(24, 24, 24)';
      colors.special_color = '#000';
      colors.special_bg = '#000';
      break;
    case 'innovative':
      colors.color = '#fff';
      colors.bg = '#333';
      colors.special_color = '#2f2133';
      colors.special_bg = '#ff0bac';
      break;
    case 'basic':
      colors.color = '#333';
      colors.bg = '#ddd';
      colors.special_color = '#81cf4d';
      colors.special_bg = '#cf4d4d';
      break;
  }
  return colors;
}
let fail_message = {};
function checkValidation(data) {
  fail_message = {};
  if (/[^|a-z0-9]+/g.test(data.lname) || data.lname.length < 3)
    fail_message["lname"] = "lname is doesnt match the size its supposed to be";
  if (data.bname.length < 10 || data.bname.length > 50)
    fail_message["bname"] = "bname is not good";
  if (data.description.length < 50 || data.description.length > 200)
    fail_message["description"] = "description sucks";
  if (!email_tester.test(data.bemail))
    fail_message["bemail"] = "email not currect";
  if (data.btel.lastIndexOf("+972") !== 0)
    fail_message["btel"] = "tel must start with +972";
  if (data.btel.length < 12 || data.btel.length > 13)
    fail_message["btel"] = "tel is too short / long";
  if (data.whatsapp.length != 0 && data.whatsapp.lastIndexOf("+972") !== 0)
    fail_message["whatsapp"] = "whatsapp must start with +972";
  if (data.whatsapp.length != 0 && data.whatsapp.length != 13)
    fail_message["whatsapp"] = "whatsapp length needs to be 13";
  if (data.llocation.length > 0 && data.tlocation.length == 0)
    fail_message["tlocation"] =
      "cant write link-location when theres no text location";
  if (
    data.llocation.length > 0 &&
    !linkIsValid(data.llocation, ["waze.com", "goo.gl/", "google.com/maps/"])
  )
    fail_message["llocation"] = "link is not waze / googole maps";
  if (data.facebook_link.length > 0 && data.facebook_username.length == 0)
    fail_message["FBusername"] =
      "cant write facebook link when theres no username";
  if (
    data.facebook_username.length > 0 &&
    data.facebook_link.length !== 0 &&
    !linkIsValid(data.facebook_link, ["facebook.com"])
  )
    fail_message["FBlink"] = "facebook link is not from facebook..";
  if (data.instagram_link.length > 0 && data.instagram_username.length == 0)
    fail_message["IGusername"] =
      "cant write instagram link when theres no username";
  if (
    data.instagram_username.length > 0 &&
    data.instagram_link.length !== 0 &&
    !linkIsValid(data.instagram_link, ["instagram.com"])
  )
    fail_message["IGlink"] = "instagram link ainr valid";
  if (data.twitter_link.length > 0 && data.twitter_username.length == 0)
    fail_message["TWusername"] =
      "cant write twitter link when theres no username";
  if (
    data.twitter_username.length > 0 &&
    data.twitter_link.length !== 0 &&
    !linkIsValid(data.twitter_link, ["twitter.com"])
  )
    fail_message["TWlink"] = "twitter link ainr valid";
  if (data.tiktok_link.length > 0 && data.tiktok_username.length == 0)
    fail_message["TKusername"] =
      "cant write tiktok link when theres no username";
  if (
    data.tiktok_username.length > 0 &&
    data.tiktok_link.length !== 0 &&
    !linkIsValid(data.tiktok_link, ["tiktok.com"])
  )
    fail_message["TKlink"] = "tiktok link ainr valid";
  if (!["basic", "innovative", "classic", "smooth"].includes(data.bcard_type))
    fail_message["bcardType"] = "bcard type doesnt found";

  if (Object.keys(fail_message).length === 0) return true;
}

function linkIsValid(link, po) {
  if (!link.lastIndexOf("https://") == 0) {
    return false;
  }
  if (!po.some((opt) => link.includes(opt))) {
    return false;
  }
  return true;
}

route.get("/b/:lname", (req, res) => {
  const { lname } = req.params;
  bcard_Schema
    .findOne({ lname })
    .then((data) => {
      if (data != null) {
        let exist_cookie = req.cookies[`visited${req.params.lname}`];
        if (typeof exist_cookie == "undefined") {
          res.cookie(`visited${req.params.lname}`, true, {
            httpOnly: true,
            maxAge: 86400000,
          });
          updateViews(lname, data.views);
        }
        data.user_key = 0;
        res.status(200);
        res.render("ejs/card", { data });
      } else {
        res.status(201);
        res.render("ejs/fail", {
          err: "כרטיס לא נמצא במערכת",
          errStatus: "404",
        });
      }
    })
    .catch(() =>
      res.redirect('/error')
    );
});

async function updateViews(lname, v) {
  await bcard_Schema.findOneAndUpdate(
    { lname },
    { views: v + 1 },
    { useFindAndModify: false }
  );
}

route.get("/dashboard", (req, res) => {
  if (res.locals.email !== "undefined" && res.locals.bcard === "exist") {
    bcard_Schema
      .findOne({ user_key: res.locals.key })
      .then((data) => {
        res.render("ejs/dashboard", {
          success_edit: "false",
          data,
        });
      })
      .catch((err) =>
        res.redirect('/error')
      );
  } else {
    return res.redirect("/");
  }
});
route.post("/editCard", (req, res) => {
  if (res.locals.email == "undefined") {
    res.json("התחברו לחשבון ונסו שנית.");
  } else if (["basic", "innovative", "classic", "smooth"].includes(req.body.bcard_type)) {
    bcard_Schema
      .findOneAndUpdate(
        { user_key: req.body.user_key },
        { bcard_type: req.body.bcard_type, colors: set_colors(req.body.bcard_type)},
        { useFindAndModify: false, new: true }
      )
      .then((data) => {
        if (data == null) {
          res.json("כרטיס לא נמצא");
        } else {
          res.json(
            {
              msg: 'העיצוב שונה בהצלחה <i class="fas fa-check-circle"></i>',
              bcard_type: data.bcard_type,
              data_colors: data.colors,
            });
        }
      })
      .catch(() => res.redirect('/error'));
  } else {
    res.json("invalid bcard-type");
  }
});

route.post('/editColors', (req, res) => {
  if(colorChecker(req.body.colors.color) && colorChecker(req.body.colors.bg) && colorChecker(req.body.colors.special_color) && colorChecker(req.body.colors.special_bg)){
    bcard_Schema.findOneAndUpdate({ user_key: req.body.user_key }, { colors: req.body.colors }, { useFindAndModify: false}).then(() => res.json('הצבעים עודכנו <i class="fas fa-check-circle"></i>'))
  } else {
    res.json('צבע שגוי')
  }
})
const colorChecker = (color) => /^#[0-9A-F]{6}$/i.test(color);
route.get("/deleteCard/:user_key/:logo_location", (req, res) => {
  let { user_key, logo_location } = req.params;
  if (user_key == res.locals.key) {
    bcard_Schema
      .deleteOne({ user_key })
      .then(() => {
        unlinkAsync(`./public/uploads/${logo_location}`);
        res.render("ejs/done", {
          headline: "הכרטיס שלך נמחק בהצלחה",
        })
      })
      .catch(() =>
        res.redirect('/error')
      );
  } else {
    res.render("ejs/fail", {
      err: "אתה לא מחובר לחשבון של בעל הכרטיס.",
      errStatus: "undefined",
    });
  }
});

// error routes
route.get('/error', (req, res) => {
  res.render("ejs/fail", {
    err: "שגיאה לא צפויה, נסו שוב.",
    errStatus: 'undefined'
  });
})

route.get('*', (req, res) => {
  res.render("ejs/fail", {
        err: "הדף הזה לא קיים",
        errStatus: "404",
    });
})
module.exports = route;
