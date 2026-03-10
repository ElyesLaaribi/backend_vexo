const asyncHandler = require("../utils/errors/asyncHandler.js")
const CustomError = require("../utils/errors/CustomError.js")
const Media = require("../models/media.model.js")
const FCM = require("../models/fcmToken.model.js")
const processFile = require("../utils/linksUtils/thumbnailGenerator.js");
const User = require("../models/user.model.js")
const  sendNotification = require("../webhooks/stripe/wh_controllers/notification.js")

const { S3Client , PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { uploadToCloud , deleteFolderFromCloud } =  require("../utils/aws/upload.js")

const s3Config = {
  credentials : {
    accessKeyId : process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey : process.env.AWS_SECRET_ACCESS_KEY,
  },
  region : process.env.AWS_REGION,
}
// If using Backblaze B2 or another S3-compatible provider, set AWS_ENDPOINT
if (process.env.AWS_ENDPOINT) {
  s3Config.endpoint = process.env.AWS_ENDPOINT
  s3Config.forcePathStyle = true
}
const s3 = new S3Client(s3Config)

// Generate a 7-day pre-signed URL for private bucket objects
const getSignedFileUrl = async (key) => {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  })
  return getSignedUrl(s3, command, { expiresIn: 60 * 60 * 24 * 7 }) // 7 days
}


 

// ROUTE FOR WEB VIEW...
const getLinkPage = asyncHandler ( async (req , res , next )=> {

    const uuid = req.params.id
    const link = await Media.findOne({uuid : uuid.toString()})
    .select({
      "priceSet" : 1 , 
      "ThumbnailsPath" : 1 ,
      "NumberOfMedia" : 1 ,
      "thumbnailsNames" : 1 ,
      "NumberOfMedia" : 1 ,
      "NumberOfMedia" : 1 ,
      "DataType" : 1,
      "expired" : 1 ,
      "user" : 1
    })

 


 
    // try { 

    //   await sendNotification ("f1psknOTSQKgcBCDC8D92e:APA91bGt1gZZYA1CeoZFxT1Q2oakPyCQSZDE8QVuWKSdE6Cg7Xaz95uDD7hwjnOshhY9K2kOuoVLYnSUlC9y6T2U51u0kvtSaNj3khqXq2xPQ3oXKSug4io" , "Duckie!" , `Someone paid for you egg with ` )
    // }
    // catch(e) { 
    //   console.log(e.message)
    // }
 
 
    if (!uuid || !link || link.expired == true) return next(new CustomError('link may be expired or didnt exist', 303))
    
    await Media.findOneAndUpdate(
        {
          uuid : uuid.toString() , 
        },
        {
          $inc: { views : 1 }
        }
      )

    const linkData = link.toObject();
    if (linkData?.priceSet !== undefined && linkData?.priceSet !== null) {
      linkData.priceSet = parseFloat(linkData.priceSet.toString());
    }

    // Convert thumbnail filenames to pre-signed URLs
    if (linkData.thumbnailsNames && linkData.thumbnailsNames.length > 0 && linkData.ThumbnailsPath) {
      linkData.thumbnailsUrl = await Promise.all(
        linkData.thumbnailsNames.map(async (name) => {
          return await getSignedFileUrl(`${linkData.ThumbnailsPath}/${name}`)
        })
      )
    }

    res.status(200).json({
      status :200 ,
      success : true , 
      data : linkData
    })

})



const createMediaLink = asyncHandler(async (req, res, next) => {
  let mediaCreated = null;
  let filesUploaded = false;
  let thumbnailsCreated = false;

  try {
    const { price } = req.body; 
    if (!price) {
      return next(new CustomError("Price is required", 400));   
    }

    const userId = req.user._id;  
    const { folderPath, timestamp, ThumbnailsPath } = req;   
    if (!folderPath || !timestamp || !ThumbnailsPath) {
      console.log(" creating folderPath / timeStamp / ThumbnailsPath for media")
      return next(new CustomError("Missing required data for media creation", 400));   
    }

    const uuid = req.uuid;   
    if (!uuid) {
      return next(new CustomError("UUID is required", 400));   
    }

    // Upload files to S3
    try {
      for (const file of req.files) {
        console.log(`uplaoding ${file.originalname} currently to the cloud`)
        await uploadToCloud(s3, file, folderPath);
      }
      filesUploaded = true;
    } catch (e) {
      console.error("S3 Upload Error:", e);
      return next(new CustomError("Failed to upload files to S3", 500));
    }

    const files = req.files.map((file) => file.originalname); 

    // Thumbnail generation
    try {
      console.log("generating thumbnails for meddia ...")
      var thumbnails = req.files.map((file) => {
    const originalName = file.originalname;
    const extension = originalName.split('.').pop().toLowerCase();
    const nameWithoutExt = originalName.split('.')[0];
    
    // List of common image extensions
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
    // List of common video extensions
    const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv'];
    
    if (imageExtensions.includes(extension)) {
        return `${nameWithoutExt}-thumbnail.jpg`;
    } else if (videoExtensions.includes(extension)) {
        return `${nameWithoutExt}-thumbnail-vid.jpg`;
    } else {
        // Default case for other file types
        return `${nameWithoutExt}-thumbnail.jpg`;
    }
});
      await Promise.all(req.files.map((file) => processFile(file, ThumbnailsPath)));
      thumbnailsCreated = true;
    } catch(e) {
      console.error("Thumbnail Error:", e);
      // Clean up uploaded files if thumbnails fail
      if (filesUploaded) {
        await deleteFolderFromCloud(s3, ThumbnailsPath).catch(cleanupError => 
          console.error("Cleanup Error:", cleanupError)
        );
      }
      return next(new CustomError("Failed to generate thumbnails", 400));
    }

    const fullUrl = `${process.env.LINKS_URL_BEFORE_UUID}${uuid}`;

    try {
      console.log("saving data in database ...")
      mediaCreated = await Media.create({
        priceSet: Number(price),   
        mediaUrl: fullUrl,
        ThumbnailsPath: ThumbnailsPath,
        uuid: uuid,
        mediaPath: folderPath,
        NumberOfMedia: files.length,
        DataType: req.type,
        fileNames: files,
        thumbnailsNames: thumbnails,
        createdAt: timestamp,
        user: userId,
      });
    } catch (e) {
      console.log("deleting uplaoded media from cloud due an error ...")
      console.error("Database Error:", e);
      // Clean up uploaded files and thumbnails if media creation fails
      if (filesUploaded) {
        await deleteFolderFromCloud(s3, folderPath).catch(cleanupError => 
          console.error("Cleanup Error:", cleanupError)
        );
      }
      if (thumbnailsCreated) {
        await deleteFolderFromCloud(s3, ThumbnailsPath).catch(cleanupError => 
          console.error("Cleanup Error:", cleanupError)
        );
      }
      return next(new CustomError("Failed to create media record", 500));
    }

    const firstThumbnailPresigned = thumbnailsCreated && mediaCreated.thumbnailsNames?.length > 0 
      ? await getSignedFileUrl(`${ThumbnailsPath}/${mediaCreated.thumbnailsNames[0]}`) 
      : null;

    res.status(200).json({
      status: 200,
      message: 'Media link created successfully',
      media: mediaCreated,
      success: true,
      url: fullUrl,
      ThumbnailPath : mediaCreated.ThumbnailsPath,
      firstThumbnail: firstThumbnailPresigned || mediaCreated.thumbnailsNames[0], // Pre-signed root level access for Flutter
      date: mediaCreated.createdAt, // Also including date at root level
      dataType: mediaCreated.DataType,// Also including DataType at root level
      price : mediaCreated.priceSet,
      NumberOfMedia : mediaCreated.NumberOfMedia,
      id : mediaCreated._id
    });

  } catch (error) {
    console.error("Create Media Error:", error);
    
    // Comprehensive cleanup if something unexpected fails
    try {
      if (filesUploaded) {
        await deleteFolderFromCloud(s3, folderPath);
      }
      if (thumbnailsCreated) {
        await deleteFolderFromCloud(s3, ThumbnailsPath);
      }
      if (mediaCreated) {
        await Media.findByIdAndDelete(mediaCreated._id);
      }
    } catch (cleanupError) {
      console.error("Final Cleanup Error:", cleanupError);
    }
    
    return next(new CustomError("An error occurred while creating the media link", 500));   
  }
});


const createFileLink = asyncHandler(async (req, res, next) => {
  let mediaCreated = null;
  let filesUploaded = false;

  try {
    const { price } = req.body; 
    if (!price) {
      return next(new CustomError("Price is required", 400));   
    }

    const userId = req.user._id;  
    const { folderPath, timestamp } = req;   
    if (!folderPath || !timestamp) {
      console.log(" creating folderPath / timeStamp for media")
      return next(new CustomError("Missing required data for File creation", 400));   
    }

    const uuid = req.uuid;   
    if (!uuid) {
      return next(new CustomError("UUID is required", 400));   
    }

    const files = req.files.map((file) => file.originalname); 

        // Validate file extensions
    let mimeTypes;
    try {
      mimeTypes = req.files.map((file) => {
        const parts = file.originalname.split(".");
        const extension = parts[parts.length - 1].toLowerCase();
        
        const restrictedExtensions = [
          'exe', 'dll', 'bat', 'cmd', 'sh', 'bin', 'gz',
          'apk', 'msi', 'pkg', 'deb',
          'js', 'php', 'py', 'pl',  
          'sql', 'db', 'sqlite',
          'htaccess', 'env', 'conf'
        ];

        if (restrictedExtensions.includes(extension)) {
          throw { stopMap: true, message: `Unsupported File type: .${extension}` };
        }

        return extension;
      });
    } catch (e) {
      if (e.stopMap) {
        return next(new CustomError(e.message, 400));
      }
      throw e; // Re-throw unexpected errors
    }
    
//   const mimeTypes = req.files.map((file) => {
//   const parts = file.originalname.split(".");
//   const extension = parts[parts.length - 1].toLowerCase(); // get extension and normalize to lowercase
  
//   // List of restricted/unsellable extensions
//   const restrictedExtensions = [
//     'exe', 'dll', 'bat', 'cmd', 'sh', 'bin', // executable files
//     'zip', 'rar', '7z', 'tar', 'gz', // compressed archives
//     'apk', 'msi', 'pkg', 'deb', // installers
//     'js', 'php', 'py', 'pl', 'rb', // script files
//     'sql', 'db', 'sqlite', // database files
//     'htaccess', 'env', 'conf' // config files
//   ];

//   // Check if extension is restricted
//   if (restrictedExtensions.includes(extension)) {
//     return next(new CustomError("Unsupported File type", 400));   
//   }

//   return extension;
// });



    // Upload files to S3
    try {
      for (const file of req.files) {
        console.log(`uplaoding ${file.originalname} currently to the cloud`)
        await uploadToCloud(s3, file, folderPath);
      }
      filesUploaded = true;
    } catch (e) {
      console.error("S3 Upload Error:", e);
      return next(new CustomError("Failed to upload files to S3", 500));
    }

    const fullUrl = `${process.env.LINKS_URL_BEFORE_UUID}${uuid}`;

    try {
      console.log("uplaoding to a data base ...")
      mediaCreated = await Media.create({
        priceSet: Number(price),   
        mediaUrl: fullUrl, 
        uuid: uuid,
        mediaPath: folderPath,
        NumberOfMedia: files.length,
        fileNames: files,
        DataType: req.type,
        thumbnailsNames: mimeTypes,
        createdAt: timestamp,
        user: userId,
      });
    } catch (e) {
      console.log("deleting uplaoded files from cloud due an error ...")
      console.error("Database Error:", e);
      // Clean up uploaded files if media creation fails
      if (filesUploaded) {
        await deleteFolderFromCloud(s3, folderPath).catch(cleanupError => 
          console.error("Cleanup Error:", cleanupError)
        );
      }
      return next(new CustomError("Failed to create file record", 500));
    }

    res.status(200).json({
      status: 200,
      message: 'File link created successfully',
      media: mediaCreated,
      success: true,
      url: fullUrl, 
      date: mediaCreated.createdAt, // Also including date at root level
      dataType: mediaCreated.DataType, // Also including DataType at root level 
      price : mediaCreated.priceSet,
      NumberOfMedia : mediaCreated.NumberOfMedia,
      id : mediaCreated._id
    });

  } catch (error) {
    console.error("Create File Error:", error);
    
    // Comprehensive cleanup if something unexpected fails
    try {
      if (filesUploaded) {
        await deleteFolderFromCloud(s3, folderPath);
      }
      if (mediaCreated) {
        await Media.findByIdAndDelete(mediaCreated._id);
      }
    } catch (cleanupError) {
      console.error("Final Cleanup Error:", cleanupError);
    }
    
    return next(new CustomError("An error occurred while creating the File link", 500));   
  }
});
 
const getMediaDetails = asyncHandler(async (req ,res , next)=> {

  const id = req.params.id 
  const media = await Media.findOne({
    _id : id.substring(1, ),
    user : req.user._id
  }).select(
    { "_id" : 1 ,
      "priceSet" : 1,
      "views": 1,
      "sales": 1 ,
      "createdAt" : 1,
      "expired" : 1,
      "DataType" : 1,
      "thumbnailsNames" :1 ,
      "ThumbnailsPath" : 1,
      "mediaUrl" :1 ,
    })
 
  if(!media) return next(new CustomError("media doesnt exist!", 400))
 
  const mediaData = media.toObject();
  if (mediaData.thumbnailsNames && mediaData.thumbnailsNames.length > 0 && mediaData.ThumbnailsPath) {
    mediaData.thumbnailsUrl = await Promise.all(
      mediaData.thumbnailsNames.map(async (name) => {
        return await getSignedFileUrl(`${mediaData.ThumbnailsPath}/${name}`)
      })
    )
  }

  res.status(200).json({
    status : 200 , 
    message : 'success',
    media : mediaData,
  })

})


const getAllUserMedia = asyncHandler(async (req ,res , next)=> {

  try {
 

      const media = await Media.find({
        user : req.user._id
      }).select(
        { "_id" : 1 ,
          "views": 1,
          "sales": 1 ,
          "createdAt" : 1,
          "NumberOfMedia":1 ,
          "expired" : 1,
          "DataType" : 1,
          "thumbnailsNames" :1 ,
          "ThumbnailsPath" : 1
        }).sort({createdAt : -1})

  

      // Convert to plain objects and attach signed URLs 
      const mediaWithUrls = await Promise.all(media.map(async (m) => {
        const mData = m.toObject();
        if (mData.thumbnailsNames && mData.thumbnailsNames.length > 0 && mData.ThumbnailsPath) {
          mData.thumbnailsUrl = await Promise.all(
            mData.thumbnailsNames.map(async (name) => {
              return await getSignedFileUrl(`${mData.ThumbnailsPath}/${name}`)
            })
          )
        }
        return mData;
      }));

      res.status(200).json({
        status : 200 , 
        message : 'success',
        length : media.length , 
        media : mediaWithUrls,
      })
    }
    catch(e) {
      return next(new CustomError("Failed fetching your media ...",400))
    }

})

const expireLink = asyncHandler(async (req , res , next)=> {

  console.log(`link expired from a user with the email of ${req.user.email}`)
  const linkId = req.params.id
  await Media.findOneAndUpdate(
    {
      _id : linkId ,
      user : req.user._id, 
    },
    {
      expired : true,
    }
  )


  res.status(200).json({
    status : 200 , 
    message : 'success',
    res : true,
  }) 
})

 

module.exports = {createMediaLink , getLinkPage , createFileLink , getMediaDetails , getAllUserMedia , expireLink} 
