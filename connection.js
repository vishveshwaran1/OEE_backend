const mongoose = require("mongoose");


const connection = async () => {
    try {
     const uri = process.env.MONGODB_URI ;
      await mongoose.connect(uri);

      console.log('Connected to MongoDB');
    } catch (e) {
      console.log('Connection error:', e);
    }
  };

  connection();
  
