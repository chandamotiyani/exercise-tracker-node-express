const express = require('express')
const app = express()
const bodyParser = require('body-parser')

const cors = require('cors')

const mongoose = require('mongoose')

// use shortid to generate random, non-repeating userIds
const shortid = require('shortid');


app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())


app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

// CREATE A NEW USER
app.post("/api/exercise/new-user", async (req, res) => {
  let newUser = new User({username: req.body.username});
  try {
    const results = await newUser.save();
    res.json({ _id: results._id, username: results.username });
  } catch (e) {
    console.log(e);
    res.send(e.code === 11000 ? "Username already exists" : "An error occurred");
  }
});

// GET LIST OF USERS
app.get("/api/exercise/users", async (req, res) => {
  try {
    // retrieve all users and exclude the log field
    const results = await User.find({}, { log: 0 });
    res.send(results);
  } catch(e) {
    console.log(e);
    res.send("An error occurred");
  }
});

// ADD NEW EXERCISE
app.post("/api/exercise/add", async (req, res) => {
  const user = await User.findById(req.body.userId);
  if(!user) {
    res.send("userId " + req.body.userId + " not found");
    return;
  } 
  const exercise = new Exercise({ 
    description: req.body.description,
    duration: req.body.duration
  });
  // if a date was provided, set it in the exercise
  //  otherwise MongoDB will default it to Date.now()
  if(req.body.date) exercise.date = req.body.date
  user.log.push(exercise);
  
  try {
    await user.save();
    // res.json(user);
    res.json({
      _id: user._id,
      username: user.username,
      description: exercise.description,
      duration: exercise.duration,
      date: exercise.date
    })
  } catch(e) {
    console.log(e);
    res.send("Sorry, there was an error saving the exercise.");
  }
});

// GET EXERCISE LOG
app.get("/api/exercise/log", async (req, res) => {
  // define the date conditions if from and/or to were provided
  const conditionFrom = {}, conditionTo = {};
  if(req.query.from) conditionFrom.$gte = ["$$this.date", new Date(req.query.from)];
  if(req.query.to) conditionTo.$lte = ["$$this.date", new Date(req.query.to)];
  
  // set up filter for dates
  const logDateFilter = { $filter: { input: '$log', cond: { $and: [conditionFrom, conditionTo]} }}
  // if a limit was provided, add a $slice to the pipeline
  const logSliceAndFilter = req.query.limit
    ? { $slice: [logDateFilter, parseInt(req.query.limit)]}
    : logDateFilter
  
  try {
    const user = await User.aggregate([ 
      { $match: { _id: req.query.userId} }, // look first for document matching _id
      { 
        $project: {
          username: "$username",
          count: { $literal: 0 }, // temporarily add in a count of 0
          log: logSliceAndFilter
        }  
      }
    ]);
    
    if(user.length === 0) {
      res.send("userId " + req.query.userId + " not found");
    } else {
      user[0].count = user[0].log.length; // set count to the filtered log length
      res.json(user[0]);
    }
  } catch(e) {
    console.log(e);
    res.send("Sorry, an error has occurred");
  }
});

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: '404: Page not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
});

function getFormatedDate(date) {
  date = new Date(date);
  var dd = date.getDate();
  if (dd < 10) {
        dd = "0" + dd;
      } 
  return (
    getWeekDay(date) +
    " " +
    getTextMonth(date) +
    " " +
    dd +
    " " +
    date.getFullYear()
  );
}

function getWeekDay(date) {
  
  //Create an array containing each day, starting with Sunday.
  var weekdays = new Array("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat");
  //Use the getDay() method to get the day.
  var day = date.getDay();
  //Return the element that corresponds to that index.
  return weekdays[day];
}

function getTextMonth(date) {
  var months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  var month = date.getMonth();
  return months[month];
}



app.set('json replacer', function (key, value) {
  if (this[key] instanceof Date) {
    // Your own custom date serialization
    
    value = getFormatedDate(this[key]);
  }

  return value;
});

const dbConfig = { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true};
const exerciseSchema = {
    _id: false,
    description: String,
    duration: Number,
    date: { type: Date, default: Date.now }
};
const userSchema = new mongoose.Schema({
  _id: { type: String, default: shortid.generate },
  username: { type: String, required: true, unique: true },
  log: [exerciseSchema]
});
const User = mongoose.model('User', userSchema);
const Exercise = mongoose.model('Exercise', exerciseSchema);

mongoose
  .connect(process.env.MLAB_URI, dbConfig)
  .then(result => {
    // start the server
    const listener = app.listen(process.env.PORT || 3000, () => {
        console.log('App is listening on port ' + listener.address().port)
    });
  })
  .catch(err => {
    console.log(err);
  });


