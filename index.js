// NODE.JS WEBSITE BACKEND
// HANDLES LITERALLY EVERYTHING

// importing some useful modules
var express = require("express"); // handles request/response cycles and routing
var http = require("http"); // server initializer
var path = require("path"); // filepathing tool
var multer = require("multer"); // parses all the formData sent in from the client side scripts
var mongoose = require("mongoose"); // nice little bridging API to go from mongoDB data to standard manipulatable javascript objects
var eventEmitter = require("node:events"); // the goblin workaround for asynchronous database functions
// var FileReader = require("filereader");

// instantiate a few modules
var events = new eventEmitter();
var formParser = multer();
var app = express();

// some express setup
app.set("views", path.join(__dirname, "views"));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, "public")));

// hard counters CTRL-SHIFT-I armchair hackers
const DBusername = process.env['MongoDB_Username'];
const DBpass = process.env['MongoDB_Password']

// initializing mongoDB
var uri = `mongodb+srv://${DBusername}:${DBpass}@itemdata.11hpdle.mongodb.net/testWDate?retryWrites=true&w=majority&appName=ItemData`;
var ItemSchema = new mongoose.Schema({
  _id : String,
  Name : String,
  Links : [String],
  Description : String,
  Comments : [String],
  LastPurchased : Date,
  InCart : {type : Boolean, default : false},
  ImageDataURL : String
}, {autoCreate : false, autoIndex : false});

var UserSchema = new mongoose.Schema({
  Username : {type : String, unique : true},
  Password : String,
  Items : [ItemSchema]
});

// mongoose takes the mongoDB document schema i set earlier and turns it into a class i can instantiate and use
var Item = mongoose.model("Item", ItemSchema);
var User = mongoose.model("User", UserSchema);

// a few globals because cross url communication makes me >:( 
var message; 
var sessionUser;
var logoutRequest = false;

// locally hosting for now
http.createServer(app).listen(3000);

// landing page
app.get('/', (req, res) => {
  if (!logoutRequest) {
    if (sessionUser) { 
      console.log("ping");
      res.render("backBlocker"); // goblin log out block
    } else {
      logoutRequest = false;
      res.render("loginPage"); 
    }
  } else {
    sessionUser = null;
    res.render("loginPage");
  }
});

app.get("/logout", (req, res) => {
  logoutRequest = true;
  res.render("backBlocker"); 
});

// ping from client side register button, using formdata to parse attached account creds
app.post("/accounts/register", formParser.none(), (req, res) => {
  register(req); // async database call
  events.once("registration-complete", () => { 
    var mess = message;
    message = "";
    res.send(mess); // wait for the database to return a result before pinging back to the client
  });
});

// most of these ping handlers that make database calls are structured like this to deal with the async db query runtime
app.post("/accounts/login", formParser.none(), (req, res) => {
  login(req);
  events.once("login-complete", () => {
    var mess = message;
    message = "";
    res.send(mess);
  })
});

// the user's "home page"
app.get("/history", (req, res) => {
  res.render("history", {user : sessionUser.Username});
});

app.post("/items/load", (req, res) => {
  res.json(sessionUser.Items.sort((a, b) => b.LastPurchased.getTime() - a.LastPurchased.getTime())); // send the client an ordered list of the user's items to display in history
});

app.get("/items/profile", (req, res) => {
  for (var Item of sessionUser.Items) {
    if (Item._id == req.query.id) {
      console.log(Item.ImageDataURL)
      res.render("profile", {_id : Item._id, itemName : Item.Name, description : Item.Description, lastPurchased : Item.LastPurchased.toISOString().substring(0, 10), comments : Item.Comments, links : Item.Links, image : Item.ImageDataURL}); // send over a specific item's details for profile generation
    }
  }
});

app.get("/items/create", (req, res) => {
  res.render("createItem");
});

// request ping from the new item info submission
app.post("/items/create", formParser.any(), (req, res) => {
  var itemExists = false;
  for (var item of sessionUser.Items) {
    if (item.Name == req.body.ItemName) {
      itemExists = true;
      res.send("Item already exists"); 
      break;
      // error for now, try a prompt-confirm-redirect on client side to item update system later
    }
  }
  if (!itemExists) { // make sure we aren't duplicating items
    enterItem(req);
    events.once("entry-complete", () => {
      var mess = message;
      message = "";
      res.send(mess);
    });
  }
});

app.get("/items/update", (req, res) => {
  for (var Item of sessionUser.Items) {
    if (Item._id == req.query.id) {
      for (var index = 0; Item.Comments[index] != null; index++) {
        Item.Comments[index] = Item.Comments[index].replace(/"/g, "\'"); // stop extra "" from unexpectedly punching holes into my JSON.stringify output
      }

      res.render("updateItem", {_id : Item._id, itemName : Item.Name, description : Item.Description, lastPurchased : Item.LastPurchased.toISOString().substring(0, 10), comments : JSON.stringify(Item.Comments), links : JSON.stringify(Item.Links), image : Item.ImageDataURL}); // grab item's initial values to put into the input fields
    }
  }
});

// on updated item submission
app.post("/items/update", formParser.any(), (req, res) => {   
  saveUpdate(req);
  events.once("update-complete", () => {
    var mess = message;
    message = "";
    res.send(mess);
  });
});

// delete item ping from button on profile page
app.post("/items/delete", (req, res) => {
  deleteItem(req);
  events.once("delete-complete", () => {
    var mess = message;
    message = "";
    res.send(mess);
  });
});

// add to cart ping from history
app.post("/cart/add", (req, res) => {
  addToCart(req);
  events.once("cart-addition-complete", () => {
    var mess = message;
    message = "";
    res.send(mess);
  });
});

// remove from cart ping 
app.post("/cart/remove", (req, res) => {
  removeFromCart(req);
  events.once("cart-removal-complete", () => {
    var mess = message;
    message = "";
    res.send(mess);
  });
});

app.post("/cart/load", (req, res) => {
  var shoppingCart = [];
  for (var Item of sessionUser.Items) {
    if (Item.InCart) {
      shoppingCart.push(Item);
    }
  }
  res.json(shoppingCart.sort((a, b) => b.LastPurchased.getTime() - a.LastPurchased.getTime()));
});

app.get("/cart", (req, res) => {
  res.render("cart");
});

app.post("/cart/clear", (req, res) => {
  clearCart();
  events.once("cart-clear-complete", () => {
    var mess = message;
    message = "";
    res.send(mess);
  });
});

app.post("/cart/checkout", (req, res) => {
  checkoutCart();
  events.once("cart-checkout-complete", () => {
    var mess = message;
    message = "";
    res.send(mess);
  })
})

async function register(req) {
  await mongoose.connect(uri);

  try {
    var check = await User.findOne({Username : req.body.Username}).exec();
    if (check) {
      message = "Account already exists, try logging in if this is you, or choose a different name";
      events.emit("registration-complete");
    } else {
      sessionUser = new User({Username : req.body.Username, Password : req.body.Password});
      await sessionUser.save();
      message = "success";
      events.emit("registration-complete");
    }
  } catch (err) {
    message = "An error has occured in the registration process";
    events.emit("registration-complete");
  }

  await mongoose.connection.close();
}

async function login(req) {
  await mongoose.connect(uri);

  try {
    var check = await User.findOne({Username : req.body.Username, Password : req.body.Password}).exec();
    if (check) {
      sessionUser = check;
      message = "success";
      events.emit("login-complete");
    } else {
      message = "Incorrect login details, review your input or try registering";
      events.emit("login-complete");
    }
  } catch (err) {
    message = "An error has occured in the authentication process";
    events.emit("login-complete");
  }

  await mongoose.connection.close();
}

async function enterItem (req) {
  await mongoose.connect(uri);
  var id = req.body.ItemName.split(/\s/).join("-");
  var reset = sessionUser;
  try {
    var entry = new Item({_id : id, Name : req.body.ItemName, Links : JSON.parse(req.body.Links), Description : req.body.Description, Comments : JSON.parse(req.body.Comments), LastPurchased : new Date(""+req.body.LastPurchased+"T04"), ImageDataURL : req.body.ImageDataURL});
    sessionUser.Items.push(entry);
    await sessionUser.save(); 
    message = "Item successfully entered into database";
    events.emit("entry-complete");
  } catch (err) {
    console.error(err);
    message = "An error has occured in the item creation process. Your account has been reverted to its previous state";
    sessionUser = reset;
    events.emit("entry-complete");
  }

  await mongoose.connection.close();
}

async function saveUpdate(req) {
  await mongoose.connect(uri);
  var itemFound = false;
  var reset = sessionUser;
  try {
    for (var i = 0; sessionUser.Items[i] != null; i++) {
      if (sessionUser.Items[i]._id == req.query.id) {
        sessionUser.Items[i].Name = req.body.ItemName;
        sessionUser.Items[i]._id = req.body.ItemName.split(/\s/).join("-");
        sessionUser.Items[i].Description = req.body.Description;
        sessionUser.Items[i].LastPurchased = new Date(req.body.LastPurchased);
        sessionUser.Items[i].Comments = JSON.parse(req.body.Comments);
        sessionUser.Items[i].Links = JSON.parse(req.body.Links);
        sessionUser.Items[i].ImageDataURL = req.body.ImageDataURL;
        await sessionUser.save();
        itemFound = true;
        message = "Item successfully updated";
        events.emit("update-complete");
      }
    }  
    if (!itemFound) {
      message = "SECRET ACHIEVEMENT: MANAGING TO UPDATE AN ITEM FROM A NONEXISTING PROFILE SOMEHOW";
      events.emit("update-complete");
    }
  } catch (err) {
    console.error(err);
    message = "An error has occured in the update process. The item has been restored to its previous state";
    sessionUser = reset;
    await sessionUser.save();
    events.emit("update-complete");
  }

  await mongoose.connection.close();
}

async function deleteItem(req) {
  await mongoose.connect(uri);
  var reset = sessionUser;
  try {
    for (var i = 0; sessionUser.Items[i] != null; i++) {
      if (sessionUser.Items[i]._id == req.query.id) {
        sessionUser.Items.splice(i, 1);
        await sessionUser.save();
        message = "Item deleted successfully.";
        events.emit("delete-complete");
      }
    }
  } catch (err) {
    message = "An error has occured in the deletion process. The item has been preserved";
    sessionUser = reset;
    await sessionUser.save();
    events.emit("update-complete");
  }

  await mongoose.connection.close();
}

async function addToCart(req) {
  await mongoose.connect(uri);
  var reset = sessionUser;
  try {
    for (var i = 0; sessionUser.Items[i] != null; i++) {
      if (sessionUser.Items[i]._id == req.query.id) {
        sessionUser.Items[i].InCart = true;
        await sessionUser.save();
        message = "Item added to cart successfully";
        events.emit("cart-addition-complete");
      }
    }
  } catch (err) {
    message = "An error has occured when adding item to cart. The cart's previous state has been restored";
    sessionUser = reset;
    await sessionUser.save();
    events.emit("cart-addition-complete");
  }

  await mongoose.connection.close();
}

async function removeFromCart(req) {
  await mongoose.connect(uri);
  var reset = sessionUser;
  try {
    for (var i = 0; sessionUser.Items[i] != null; i++) {
      if (sessionUser.Items[i]._id == req.query.id) {
        sessionUser.Items[i].InCart = false;
        await sessionUser.save();
        message = "Item removed from cart successfully";
        events.emit("cart-removal-complete");
      }
    }
  } catch (err) {
    message = "An error has occured when removing item from cart. The cart's previous state has been restored";
    sessionUser = reset;
    await sessionUser.save();
    events.emit("cart-removal-complete");
  }

  await mongoose.connection.close();
} 

async function clearCart() {
  await mongoose.connect(uri);
  var reset = sessionUser;

  try {
    for (var Item of sessionUser.Items) {
      if (Item.InCart) {
        Item.InCart = false;
      }
    }
    await sessionUser.save();
    message = "Cart cleared successfully";
    events.emit("cart-clear-complete");
  } catch (err) {
    message = "An error has occured when clearing the cart. The cart's previous state has been restored";
    sessionUser = reset;
    await sessionUser.save();
    events.emit("cart-clear-complete");
  }
}

async function checkoutCart() {
  await mongoose.connect(uri);
  var reset = sessionUser;

  try {
    for (var Item of sessionUser.Items) {
      if (Item.InCart) {
        Item.InCart = false;
        Item.LastPurchased = new Date();
      }
    }
    await sessionUser.save();
    message = "Transaction recorded successfully";
    events.emit("cart-checkout-complete");
  } catch (err) {
    message = "An error has occured in the recording process. The previous state of the cart and its contents has been restored";
    sessionUser = reset;
    await sessionUser.save();
    events.emit("cart-checkout-complete");
  }
}