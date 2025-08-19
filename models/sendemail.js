const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, text }) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'oeeadmistrator@gmail.com',
      pass: 'jetm stah sloi mlps', // Use an app password, not your Gmail password
    },
  });

  await transporter.sendMail({
    from: 'vichu2395@gmail.com',
    to,
    subject:'test',
    text,
  });
};

module.exports = sendEmail;
