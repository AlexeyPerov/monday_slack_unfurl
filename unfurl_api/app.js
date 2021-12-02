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

app.get('/monday/unfurl', async (req, res) => {
    try {
        const link = req.query.link;
        let result = await unfurlMondayLink(link);
        res.status(200).send(result);
    } catch (e) {
        console.log(e);
        res.status(501).send();
    }
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

    let boardOutput;
    let pulseOutput = '';

    const boardQuery = '{ boards(limit:1, ids:[' + board + '])'
        + ' { name } }';

    const boardResult = await fetchMondayQuery(boardQuery);
    const boardInfo = boardResult.data.boards[0];

    boardOutput = boardInfo.name;

    if (pulse != null && pulse.length > 0) {
        const pulseQuery = '{ items (ids: ' + pulse + ') { name } }';
        const pulseResult = await fetchMondayQuery(pulseQuery);

        const itemInfo = pulseResult.data.items[0];
        pulseOutput = itemInfo.name;
    }

    let result = new Unfurl()
    result.pulse = pulseOutput;
    result.board = boardOutput;

    return result;
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

class Unfurl {
    board;
    pulse;
}

module.exports.handler = sls(app);