const express = require("express")
const cors = require("cors")
const globalErrorHandle = require("./utils/errors/GlobalErrorHandling.js")
const multer = require('multer');
const authorize = require("./utils/authorization.js")
const bodyParser = require('body-parser');
const path = require("path")
const app = express()
const fs = require("fs")
const mongoose = require("mongoose")
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean')
require("dotenv").config()
const Media = require("./models/media.model.js");
const Payout = require("./models/payout.model.js");




const stripe_webhook = require('./webhooks/stripe/stripeWebhooks.js');

app.post('/stripe_webhook', express.raw({ type: 'application/json' }), stripe_webhook);



app.use(cors({
  origin: [
    "https://www.admez.fun",
    "http://localhost:5173"
  ],
  methods: ["GET", "POST", "PATCH"],
}));



// app.use(async (req, res, next) => {
//   try {


//         // const updateResult = await Payout.updateMany(
//         //     { 
//         //         user: "6849d86d2e2d7b34c96646ff",
//         //         date: { $exists: false } // Only update documents without a date field
//         //     },
//         //     {
//         //         $set: {
//         //             date: new Date() // Sets the current date/time
//         //             // If you want a specific date instead, use:
//         //             // date: new Date("2023-01-01T00:00:00Z")
//         //         }
//         //     }
//         // );


//         // next()


//         const result = await Media.updateMany(
//             { }, // Filter for documents where dataType is "media"
//             { $set: { expired: true } } // Set expired to true for all matching documents
//           );

//     console.log(`Expired ALL ${result.modifiedCount} media items`);
//     next();
//   } catch (error) {
//     console.error('Error expiring media:', error);
//     next(error);
//   }
// });


app.use((req, res, next) => {
  // Choose one of these:
  res.set('Cross-Origin-Resource-Policy', 'cross-origin'); // Most permissive
  // res.set('Cross-Origin-Resource-Policy', 'same-origin'); // More restrictive
  // res.set('Cross-Origin-Resource-Policy', 'same-site'); // Most restrictive

  next();
});








const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: "We have received too many request from this IP. please try again later."
});

app.use(limiter);






const didit_webhook = require('./webhooks/didit/diditWebhooks.js');
app.post('/didit_webhook_admez', bodyParser.json({
  verify: (req, res, buf, encoding) => {
    if (buf && buf.length) {
      // Store the raw body in the request object
      req.rawBody = buf.toString(encoding || "utf8");
    }
  },
}), didit_webhook);




app.use(bodyParser.json())

app.use(
  mongoSanitize({
    allowDots: true,
  }),
);

app.use(xss())





app.use('/tmp', express.static(path.join(__dirname, 'tmp')));

const storage = multer.memoryStorage()


const upload = multer({ storage: storage });


const { createMediaLink, createFileLink, getLinkPage } = require("./controllers/media.controller.js");
const { readyMediaDataLink, readyFileDataLink } = require("./utils/linksUtils/getReadyForLink.js");
const checkBan = require("./utils/isBanned/isBanned.js")
const hasPhoneNumber = require("./utils/phone/hasPhoneNumber.js")
const isVerifiedMiddleWare = require("./verification/diditVerif/isVerifiedKyc.js")
const isKycDone = require('./controllers/checkKyc.controller.js')
// USED ...
app.post('/media/createLink', authorize, checkBan, isVerifiedMiddleWare, hasPhoneNumber, readyMediaDataLink, upload.array("files"), createMediaLink);
app.post('/file/createLink', authorize, checkBan, isVerifiedMiddleWare, hasPhoneNumber, readyFileDataLink, upload.array("files"), createFileLink);

app.get('/isKycDone', authorize, isVerifiedMiddleWare, isKycDone)

app.get('/media/v1/:id', getLinkPage);


const userRoute = require("./routes/user.route.js")
const StripeSetupRoute = require("./routes/stripeSetup.route.js")
const paymentRoute = require("./routes/payment.route.js")
const payoutRoute = require("./routes/payout.route.js")
const mediaRoute = require("./routes/media.route.js")
const bankRoute = require("./routes/bank.route.js")
const verif = require("./routes/verification.route.js")
const fcm = require("./routes/fcm.route.js")
const phone = require("./routes/phone.route.js")


app.use("/account", userRoute);
app.use("/phone", phone);
app.use("/fcm", fcm);
app.use("/stripe-setup", StripeSetupRoute);
app.use("/payment", paymentRoute);
app.use("/payout", payoutRoute);
app.use("/mediaData", mediaRoute);
app.use("/bank", bankRoute);
app.use("/KYC", verif);


const isBankVerified = require("./utils/bankingUtils/bankStatusSettings.js")
const isVerifiedSetting = require("./verification/diditVerif/isVerifiedKycSettings.js")
const settings = require("./controllers/settings.controller.js")
app.get("/settingsInfo", authorize, isBankVerified, hasPhoneNumber, isVerifiedSetting, settings)




// app.get("/media/:path/:filename", (req, res) => {
//   const filePath = path.join(__dirname,  req.params.path, req.params.filename);
//   res.download(filePath); // This automatically sets the Content-Disposition header
// });

// app.get("/get-media-files", async (req, res) => {
//   const { pathUrl } = req.query; // Get the pathUrl from the query parameters

//   if (!pathUrl) {
//     return res.status(400).send("Path URL is required");
//   }

//   const mediaPath = path.join(__dirname, pathUrl); // Construct the full path

//   // Check if the directory exists
//   if (!fs.existsSync(mediaPath)) {
//     return res.status(404).send("Media directory not found");
//   }

//   // Read all files in the directory
//   fs.readdir(mediaPath, (err, files) => {
//     if (err) {
//       console.error("Error reading directory:", err);
//       return res.status(500).send("Failed to read media directory");
//     }

//     // Construct full URLs for each file
//     const fileUrls = files.map((file) => {
//       return `http://localhost:3000/${pathUrl}/${file}`;
//     });

//     // Send the list of file URLs to the client
//     res.json({ success: true, fileUrls });
//   });
// });


app.use(globalErrorHandle);




// // Thumbnail route (always images - jpg/png)
// app.get('/uploads/:userId/:folder/:filename', (req, res) => {
//     const { userId, folder, filename } = req.params;
//     const thumbPath = path.join(__dirname, 'uploads', userId, folder, filename);


//   if (folder.split("_")[0].toLowerCase() =="thumbnails") {
//     if (!fs.existsSync(thumbPath)) {
//       return res.status(404).send('Thumbnail not found');
//   }

//   // Thumbnails are always images - force image/jpeg
//   res.type('.jpg'); // or .png depending on your thumbnails format
//   res.set('Cross-Origin-Resource-Policy', 'cross-origin');

//   fs.createReadStream(thumbPath).pipe(res);
//   }
//   else {
//     if (!fs.existsSync(mediaPath)) {
//       return res.status(404).send('Media not found');
//   }

//   // Get file extension and set Content-Type automatically
//   const ext = path.extname(filename);
//   res.type(ext); // Express will automatically set the correct Content-Type

//   // Additional headers
//   res.set('Cross-Origin-Resource-Policy', 'cross-origin');

//   // For downloads instead of display, use:
//   // res.attachment(filename);

//   fs.createReadStream(mediaPath).pipe(res);

//   }


// });





mongoose.connect(process.env.MONGO_DB_STRING)
  .then(() => {
    console.log("*** Connected successfully to database ***")
    app.listen(process.env.PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${process.env.PORT}`);
    })
  })
  .catch((e) => {
    console.log(e.message)
    console.log("Failed connecting to database");
  });
