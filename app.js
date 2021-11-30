var admin = require("firebase-admin");
var serviceAccount = require("./serviceAccountKey.json");

const fetch = require("node-fetch");

require('dotenv').config();

const sls = require("serverless-http");

const express = require("express");
const app = express();

var multer = require('multer');
var upload = multer();

// for parsing application/json
app.use(express.json());

// for parsing application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// for parsing multipart/form-data
app.use(upload.array());
app.use(express.static('public'));

const defaultPrefix = process.env.DEFAULT_PREFIX;

app.get("/unfurl", async (req, res) => {
    const link = req.query.link;

    var result = "hi it's " + link;
    res.status(200).send(result);
});

app.get("/monday/unfurl", async (req, res) => {
    const link = req.query.link;

    var result = "hi it's " + link;
    res.status(200).send(result);
});

app.get("/logkeeper/unfurl", async (req, res) => {
    const link = req.query.link;

    var result = "hi it's " + link;
    res.status(200).send(result);
});

async function fetchMondayQuery(query) {
    let response = await fetch("https://api.monday.com/v2", {
        method: 'post',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': process.env.MONDAY_TOKEN
        },
        body: JSON.stringify({
            'query': query
        })
    });

    if (!response.ok) {
        throw new Error('HTTP error, status: ' + response.status);
    } else {
        return await response.json();
    }
}

function connectFirebase() {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.DB_URL
    });

}

module.exports.handler = sls(app);