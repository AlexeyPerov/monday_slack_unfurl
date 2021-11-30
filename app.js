const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

const fetch = require("node-fetch");

require('dotenv').config();

const sls = require("serverless-http");

const express = require("express");
const app = express();

const multer = require('multer');
const upload = multer();

// for parsing application/json
app.use(express.json());

// for parsing application/x-www-form-urlencoded
app.use(express.urlencoded({extended: true}));

// for parsing multipart/form-data
app.use(upload.array());
app.use(express.static('public'));

app.get("/unfurl", async (req, res) => {
    const link = req.query.link;

    if (link.contains(process.env.MONDAY_DOMAIN)) {
        let result = await unfurlMondayLink(link);
        res.status(200).send(result);
    } else if (link.contains(process.env.LOGKEEPER_DOMAIN)) {
        let result = await unfurlLogKeeperLink(link);
        res.status(200).send(result);
    } else {
        res.status(501).send();
    }
});

app.get("/monday/unfurl", async (req, res) => {
    const link = req.query.link;
    let result = await unfurlMondayLink(link);
    res.status(200).send(result);
});

app.get("/logkeeper/unfurl", async (req, res) => {
    const link = req.query.link;
    let result = await unfurlLogKeeperLink(link);
    res.status(200).send(result);
});

async function unfurlMondayLink(link) {

}

async function unfurlLogKeeperLink(link) {

}

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