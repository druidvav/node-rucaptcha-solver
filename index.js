const querystring = require('querystring');
const request = require('request-promise-native');
const fs = require('mz/fs');
const delay = require('delay');

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
        const base64Image = await this._bufferToBase64(buffer);
        const id = await this._sendImage(base64Image, options);
        const answer = await this._getAnswer(id);
        return { id, answer };
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * get balance on your rucaptcha account
     * @return {Promise<Number>} balance
     */
    async getBalance() {
        const queryObj = { key: this.apiKey, action: 'getbalance' };
        const balance = await request.get({
            url: this.GET_URL + '?' + querystring.stringify(queryObj)
        });
        return parseFloat(balance);
    }

    // noinspection JSUnusedGlobalSymbols
    async report(captchaId) {
        const queryObj = { key: this.apiKey, action: 'reportbad', id: captchaId };
        return await request.get({
            url: this.GET_URL + '?' + querystring.stringify(queryObj)
        });
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

        const json = await request.post({
            url: url,
            form: { body : base64Image }
        });
        const response = JSON.parse(json);
        if (response.status === 0) {
            throw new Error(response.request);
        }
        return parseInt(response.request);
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

        const makeRequest = async () => await request.get({ url: url });

        let result;
        while (true) {
            await delay(this.retryInterval);
            const json = await makeRequest();
            const response = JSON.parse(json);

            if (response.status === 1) { // captcha solved
                result = response.request;
                break;
            } else if (
                response.request !== 'CAPCHA_NOT_READY' &&
                response.status === 0
            ) {
                // throw if we have error
                // or bad status number
                break;
                throw new Error(response.request);
            }
        }
        return result;
    }

    /**
     * Fetch image from given path
     * path can be local (some file on your hard drive)
     * or remote (from wikipedia, for example)
     * @param  {String|Buffer} [image] variable is a img path or Buffer object or base64 text.
     * Image path can be remote or local img file.
     * @return {Promise<Buffer>} resolves to the buffer
     */
    async _fetchImage(image) {
        if (/^(http|https)/.test(image)) {      // passed url
            return await request.get({ url: image, encoding: null });
        } else if (image instanceof Buffer) {   // passed Buffer object with image
            return image;
        } else if (isBase64(image)) {           // passed base64
            return Buffer.from(image, 'base64');
        } else {                                // passed local file
            return await fs.readFile(image);
        }
    }
    /**
     * convert buffer to base64 string
     * @param  {Buffer} buf buffer
     * @return {String} base64 representation of image
     */
    _bufferToBase64(buf) {
        return buf.toString('base64');
    }
}

module.exports = Solver;