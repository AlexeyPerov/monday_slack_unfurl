const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const fetch = require('node-fetch');

require('dotenv').config();

const sls = require('serverless-http');

const express = require('express');
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

app.get('/unfurl', async (req, res) => {

    try {
        const link = req.query.link;
        if (link.includes(process.env.MONDAY_DOMAIN)) {
            let result = await unfurlMondayLink(link);
            res.status(200).send(result);
        } else if (link.includes(process.env.LOGKEEPER_DOMAIN)) {
            let result = await unfurlLogKeeperLink(link);
            res.status(200).send(result);
        } else {
            res.status(501).send();
        }
    } catch (e) {
        console.log(e);
        res.status(501).send();
    }
});

app.get('/monday/unfurl', async (req, res) => {
    const link = req.query.link;
    let result = await unfurlMondayLink(link);
    res.status(200).send(result);
});

app.get('/logkeeper/unfurl', async (req, res) => {
    const link = req.query.link;
    let result = await unfurlLogKeeperLink(link);
    res.status(200).send(result);
});

// Parses strings like:
// https://domain.monday.com/boards/1802709835/views/37620753/pulses/1957128768
// https://domain.monday.com/boards/1802709835/views/37620753/pulses/1959492575?userId=10386480
async function unfurlMondayLink(link) {
    let board;
    let pulse;

    const boardStr = 'boards';
    const boardPos = link.indexOf(boardStr);

    if (boardPos === -1) {
        throw `Unable to find ${boardStr}`;
    }

    const linkPart = link.substring(boardPos + boardStr.length + 1);
    const boardEndPos = linkPart.indexOf('/');

    if (boardEndPos !== -1) {
        board = linkPart.substring(0, boardEndPos);
    } else {
        board = linkPart;
    }

    const pulsesStr = 'pulses';

    const pulsePos = linkPart.indexOf(pulsesStr);

    if (pulsePos !== -1) {
        const pulseLinkPart = linkPart.substring(pulsePos + pulsesStr.length + 1);
        const pulseBorderPos = pulseLinkPart.indexOf('?');

        if (pulseBorderPos !== -1) {
            pulse = pulseLinkPart.substring(0, pulseBorderPos);
        } else {
            pulse = pulseLinkPart;
        }
    }

    return `${board} -> ${pulse}`;
}

// Parses strings like: https://domain/#/details?id=zEVVt0ltW65vdoppV0Eg
async function unfurlLogKeeperLink(link) {
    const idStr = '?id=';
    const pos = link.indexOf(idStr);
    if (pos === -1) {
        throw `Invalid LogKeeper string. Cannot find ${idStr} position`;
    }

    const id = link.substring(pos + idStr.length);

    if ( id == null || id.length === 0) {
        throw 'Unable to find logKeeper id';
    }

    return id;
}

async function fetchMondayQuery(query) {
    let response = await fetch('https://api.monday.com/v2', {
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