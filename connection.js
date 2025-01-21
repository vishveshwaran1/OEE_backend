const mongoose = require("mongoose");


const connection = async () => {
    try {
      //await mongoose.connect('mongodb+srv://yazhini:yazhini@cluster0.xrihspk.mongodb.net/noble_evergreen');
      await mongoose.connect('mongodb+srv://demo:demo@cluster0.8xdzq.mongodb.net/testing_oee');
      console.log('Connected to MongoDB');
    } catch (e) {
      console.log('Connection error:', e);
    }
  };

  connection();
  