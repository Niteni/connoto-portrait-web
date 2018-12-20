const AWS = require('aws-sdk');
const s3 = new AWS.S3({signatureVersion: 'v4', region: AWS_S3_REGION});

const AWS_S3_BUCKET = process.env.UPLOADER_AWS_S3_BUCKET;
const AWS_S3_REGION = process.env.PORTRAIT_AWS_S3_REGION;
const AWS_ACCESS_KEY = process.env.UPLOADER_AWS_ACCESS_KEY;
const AWS_SECRET_ACCESS_KEY = process.env.UPLOADER_AWS_SECRET_ACCESS_KEY;
const URL_EXPIRES = 300;

function getServerError(message) {
    return {statusCode: 500, body: message};
}

const ERROR_CONFIGURATION = getServerError('Some configuration is missing.');
const ERROR_MISSING_FILENAME = {statusCode: 400, body: 'Missing filename'}
const ERROR_PATH_IN_FILENAME = {statusCode: 400, body: 'Filename should not have a path'}
const ERROR_NO_LOGIN = {statusCode: 403, body: 'User not logged in'}

function getAwsConfig() {
    const credentials = {
        accessKeyId: AWS_ACCESS_KEY,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
    }

    const config = {
        credentials: credentials
    };
    return config;
}

function getS3Key(user, filename) {
    const key = user.sub + '/' + filename;
    return key;
}

function sendSignedUrl(bucket, key, callback) {
    const config = getAwsConfig();
    AWS.config.update(config);

    const params = {Bucket: bucket, Key: key, Expires: URL_EXPIRES};
    s3.getSignedUrl('putObject', params, (error, url) => {
        if(error) {
            callback(null, getServerError(error));
        } else {
            callback(null, {
                statusCode: 200,
                body: JSON.stringify({url: url})
            });
        }
    });
}

exports.handler = (event, context, callback) => {
    if(!AWS_S3_BUCKET) {
        return callback(null, ERROR_CONFIGURATION);
    }

    const user = context.clientContext && context.clientContext.user;
    const noUser = user == null || user == '';
    if(noUser) {
        return callback(null, ERROR_NO_LOGIN);
    }

    const body = JSON.parse(event.body);
    const filename = body.filename;
    const noFilename = filename == null || filename == '';
    if(noFilename) {
        return callback(null, ERROR_MISSING_FILENAME);
    }

    var filenameHasPath = filename.includes('/');
    if(filenameHasPath) {
        return callback(null, ERROR_PATH_IN_FILENAME);
    }

    const key = getS3Key(user, filename);
    sendSignedUrl(AWS_S3_BUCKET, key, callback);
};
