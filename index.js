const querystring = require('querystring');
const fs = require('mz/fs');
const delay = require('delay');
const got = require('got');

// check if string is base64
const isBase64 = str =>
    /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)$/.test(str);

class Solver {
    constructor(settings) {
        if (!settings || typeof settings !== 'object') {
            throw new Error('No settings found for solver');
        }

        this.apiKey = settings.apiKey;
        this.retryInterval = settings.retryInterval || 3000;
        this.retryCount = settings.retryCount || 20;
        this.requestTimeout = (settings.requestTimeout || 40) * 1000;

        if (!this.apiKey) {
            throw new Error(`Can't find api key`);
        }

        this.POST_URL = 'http://rucaptcha.com/in.php';
        this.GET_URL = 'http://rucaptcha.com/res.php';
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Solve captcha image, defined in image parameter
     *
     * @param  {String|Buffer} [image] variable is a img path or Buffer object or base64 text.
     * Image path can be remote or local img file.
     * @param options
     * @return {Promise<Object>} resolves to object with captcha id and answer
     * @example
     * const solver = new Solver({ apiKey: 'you-api-key' });
     * const { id, answer } = await solver.solve('https://somewebsite/image.jpg');
     */
    async solve(image, options = {}) {
        const buffer = await this._fetchImage(image);
        const id = await this._sendImage(buffer.toString('base64'), options);
        const answer = await this._getAnswer(id);
        return { id, answer };
    }

    // noinspection JSUnusedGlobalSymbols
    async getBalance() {
        const queryObj = { key: this.apiKey, action: 'getbalance' };
        return parseFloat(await got.get({
            url: this.GET_URL + '?' + querystring.stringify(queryObj),
            timeout: this.requestTimeout
        }).text());
    }

    // noinspection JSUnusedGlobalSymbols
    async report(captchaId) {
        const queryObj = { key: this.apiKey, action: 'reportbad', id: captchaId };
        return got.get({
            url: this.GET_URL + '?' + querystring.stringify(queryObj),
            timeout: this.requestTimeout
        }).text();
    }

    /**
     * send captcha image to rucaptcha server
     * @param  {String}  base64Image base64 representation of image
     * @param  {Object}  options options for captcha to send
     * @return {Promise<Number>} id number of captcha
     */
    async _sendImage(base64Image, options) {
        Object.assign(options, { key: this.apiKey, method: 'base64', json: 1 });
        const url = this.POST_URL + `?${querystring.stringify(options)}`;

        const data = await got.post({ url: url, form: { body : base64Image }, timeout: this.requestTimeout }).json();
        if (data.status === 0) {
            throw new Error(data.request);
        }
        return parseInt(data.request);
    }

    /**
     * get answer of captcha.
     * to get it, we have to send captcha id to GET request
     * @param {Number} captchaId captchaId
     * @return {Promise<String>} Captcha answer
     */
    async _getAnswer(captchaId) {
        const queryObj = { key: this.apiKey, action: 'get', id: captchaId, json: 1 };
        const url = this.GET_URL + `?${querystring.stringify(queryObj)}`;
        let tries = this.retryCount;
        do {
            const response = await got.get({ url: url, timeout: this.requestTimeout }).json();
            if (response.status === 1) {
                return response.request;
            } else if (response.request !== 'CAPCHA_NOT_READY' && response.status === 0) {
                throw new Error(response.request);
            }
            await delay(this.retryInterval);
            tries--;
        } while (tries > 0);
        throw new Error('CAPTCHA_SOLVE_TIMEOUT');
    }

    async _fetchImage(image) {
        if (/^(http|https)/.test(image)) {      // passed url
            return got.get({ url: image, encoding: null, timeout: this.requestTimeout }).buffer();
        } else if (image instanceof Buffer) {   // passed Buffer object with image
            return image;
        } else if (isBase64(image)) {           // passed base64
            return Buffer.from(image, 'base64');
        } else {                                // passed local file
            return await fs.readFile(image);
        }
    }
}

module.exports = Solver;