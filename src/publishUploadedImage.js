var async = require('async');
var aws = require('aws-sdk');
var gm = require('gm').subClass({imageMagick: true});
var s3 = new aws.S3();

const SRC_BUCKET_SUBSTRING = '-originals';
const DEST_BUCKET_SUBSTRING = '-public';
const PORTRAIT_MAX_EDGE = 1024;
const PORTRAIT_IMAGE_FORMAT = 'jpeg';

const ERROR_BAD_SOURCE_BUCKET = {statusCode: 400, body: 'Invalid source bucket - should be originals'};
const ERROR_ORIGINAL_NOT_JPEG = 'Original image is not JPEG';

function publishImage(srcObj, destObj, callback) {

    function downloadImage(next) {
        s3.getObject(srcObj, next);
    }

    function checkImageIsJpeg(response, next) {
        image = gm(response.Body);
        image.format(
            function(err, value) {
                if(err) {
                    next(err);
                } else if(value.toLowerCase() == 'jpeg') {
                    next(null, this);
                } else {
                    next(ERROR_ORIGINAL_NOT_JPEG);
                }
            }
        );
    }

    function resizeAndInterlaceImage(image, next) {
        image.resize(PORTRAIT_MAX_EDGE, PORTRAIT_MAX_EDGE)
            .interlace('Line')
            .toBuffer(
                PORTRAIT_IMAGE_FORMAT,
                function(err, buffer) {
                    if(err) {
                        next(err);
                    } else {
                        next(null, buffer);
                    }
            });
    }

    function uploadImage(data, next) {
        destObj.Body = data
        s3.putObject(destObj, next);
    }

    function notifyListeners(response, next) {
        // @TODO: Query listeners of image
        // @TODO: Push web notification to image listeners
        next(null);
    }

    function finishedOperations(err) {
        var f = (o) => o.Bucket + '/' + o.Key;
        var s = f(srcObj);
        var d = f(destObj);

        var action = 'portrait from ' + s + ' to ' + d + ': ';
        if(err) {
            action = 'Did not publish ' + action + ': ' + err;
            console.error(action);
            callback(action);
        } else {
            action = 'Published ' + action;
            console.log(action);
            callback(null, action);
        }
    }

    var operations = [
        downloadImage,
        checkImageIsJpeg,
        resizeAndInterlaceImage,
        uploadImage,
        notifyListeners
    ];

    try {
        async.waterfall(
            operations,
            finishedOperations
        );
    } catch(e) {
        callback(e);
    }
}

function getSourceAndDestination(event) {
    var srcBucket = event.Records[0].s3.bucket.name;
    var srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));

    var srcBucketIsCorrect = srcBucket.includes(SRC_BUCKET_SUBSTRING);
    if(!srcBucketIsCorrect) {
        return callback(null, ERROR_BAD_SOURCE_BUCKET);
    }

    var destBucket = srcBucket.replace(SRC_BUCKET_SUBSTRING, DEST_BUCKET_SUBSTRING);
    var srcObj = {Bucket: srcBucket, Key: srcKey};
    var destObj = {Bucket: destBucket, Key: srcKey};

    return [srcObj, destObj];
}


exports.handler = (event, context, callback) => {
    var [srcObj, destObj] = getSourceAndDestination(event);

    publishImage(srcObj, destObj, callback);
}
