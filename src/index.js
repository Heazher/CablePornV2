const Twit = require('twit');
const { twitter, aws, database } = require('../config');
const fs = require('fs');
const Path = require('path');
const request = require('request');
const AWS = require('aws-sdk');
const mongoose = require('mongoose');
const Media = require('./models/media');
const schedule = require('node-schedule');

// initialize twitter client
const T = new Twit({
    consumer_key: twitter.consumer_key,
    consumer_secret: twitter.consumer_secret,
    access_token: twitter.access_token,
    access_token_secret: twitter.access_token_secret,
    timeout_ms: 60 * 1000,
});

// initialize aws client
AWS.config.update({
    accessKeyId: aws.accessKeyId,
    secretAccessKey: aws.secretAccessKey,
    region: aws.region,
    s3ForcePathStyle: true,
});

const s3 = new AWS.S3();

// initialize database client
mongoose.connect(database.url);
mongoose.connection.on("open", () => console.log("[database] connected"));
mongoose.connection.on("error", (err) => console.log("[database] error", err));

// Sleep Technology 9000.1 BETA (More advenced than CablePorn-mstdn i tell you.)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Get a media from the database
async function getMedia() {
    let media;
    media = await Media.findOne({ isPosted: false });
    if (!media) return console.log("[database] no media found");
    const download = async (url, path, callback) => {
        await request.head(url, async (err, res, body) => {
            await request(url)
            .pipe(fs.createWriteStream(path))
            .on('close', callback)
        })
    };
    let url = media.pictname;
    if(!url.startsWith("https://")) url = `https://kyoko-cdn.s3.ap-northeast-1.amazonaws.com/${media.pictname}`;
    const path = Path.join(__dirname, `./media/${media.PostId}.jpg`);
    await download(url, path, () => {
        sendMedia(path, media)
    })
}


// Upload media to twitter
async function sendMedia(path, media) {
    // encode media in base64
    const b64Media = fs.readFileSync(path, { encoding: 'base64' });
    // upload media to twitter
    T.post('media/upload', { media_data: b64Media }, async (err, data, response) => {
        if (err) return console.log("[twitter] error", err);
        // post tweet with media
        await T.post('statuses/update', {
            status: `${media.title}\n\nAuthor: ${media.Author}\n\nSource: ${media.url}`,
            media_ids: [data.media_id_string]
        }, async (err, data, response) => {
            if (err) return console.log("[twitter] error", err);
            // update media status
            media.isPosted = true;
            await media.save();
            // delete media file
            fs.unlinkSync(path);
            console.log("[twitter] posted media");
        });
    });
}

// Post new media on boot. 
getMedia();

// Post new media everyday at 14:00 GTM
schedule.scheduleJob('0 14 * * *', () => {
    getMedia();
});