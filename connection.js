const mongoose = require("mongoose");


const connection = async () => {
    try {
      
      //await mongoose.connect('mongodb+srv://demo:demo@cluster0.8xdzq.mongodb.net/testing_oee');
      //await mongoose.connect('mongodb+srv://demo:demo@cluster0.zfvaz.mongodb.net/testing_oee');
      await mongoose.connect('mongodb+srv://demo:demo@cluster0.8xdzq.mongodb.net/transform');
      console.log('Connected to MongoDB');
    } catch (e) {
      console.log('Connection error:', e);
    }
  };

  connection();
  
