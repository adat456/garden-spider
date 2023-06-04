require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");
const { Pool } = require("pg");

// connect to PostgreSQL db
const pool = new Pool({
    user: process.env.PG_USER,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
    host: process.env.PG_HOST
});

// removes all tabs and newlines and returns updated string
function removeSpace(string) {
    const noTabsString = string.replace(/\t+/g, '');
    const noNewlineString = noTabsString.replace(/(\r\n|\n|\r)/g, "");
    return noNewlineString;
};

async function main(link) {
    const urls = new Set();

    // pulling the page's HTML
    const groupPageHTML = await axios.get(link)
    // loading the HTML into a cheerio element
    const $ = cheerio.load(groupPageHTML.data);
    // selects all links that have a URL starting with "scene" 
    // need to be able to pull ONLY by common name... not sure how yet
    const $linkElements = $("a[href^='scene']");
    // the .each method is from jQuery, iterates over the DOM elements
    $linkElements.each((index, link) => {
        // .attr is also from jQuery, gets value of the href from the cookie element
        const linkURL = "http://www.gardening.cornell.edu/homegardening/" + $(link).attr("href");
        urls.add(linkURL);
    });

    urls.forEach(async link => {
        const flowerPageHTML = await axios.get(link);
        const $ = cheerio.load(flowerPageHTML.data);

        /// TOP ///

        const name = $(".head2 p").text();

        let categoriesArr = $(".normal p:nth-child(1)").text().split(",");
        categoriesArr = categoriesArr.map(category => {
            return removeSpace(category).trim();
        });
        // returns: [ 'Herbaceous Perennial Flower', 'Wildflower' ]

        let alternativeNames = $(".normal p:nth-child(2)").text().trim();
        alternativeNames = alternativeNames.replace(/\t+/g, '');
        alternativeNames = alternativeNames.replace(/(\r\n|\n|\r)/g, ",");
        alternativeNames = alternativeNames.replace("Also known as ", "");
        // currently returns: Common Zinnia,,,,,,,,Zinnia elegans medium height,,,,,,,,Asteraceae Family
        // need to remove commas and convert to array
        
        const description = $(".normal p:nth-child(3)").text().trim();

        /// BOTTOM ///

        let siteCharac = $("a[name='profile'] + table .intro:nth-child(1)").text().trim();
        // removes "Site characteristics" from the beginning
        siteCharac = removeSpace(siteCharac).replace("Site Characteristics", "");
        // result: Sunlight:full sunpart shadePrefers full sun.  More likely to flop in part shade.Soil conditions:requires well-drained soilPrefers moist but well-drained soil.Hardiness zones:3 to 8

        let plantTraits = $("td[bgcolor='F0F6E6'] > table > tbody > tr:nth-child(2) > td > .intro").text().trim();
        plantTraits = removeSpace(plantTraits);
        // returns: Lifecycle: annual Ease-of-care: easyHeight:1.5 to 2.5 feetSpread: 1 to 2 feetBloom time: mid-summerlate summerearly fallmid-fallFlower color: redorangeyellowvioletwhitepinkFoliage color: medium greendark greenFoliage texture: mediumShape: upright Shape in flower: same as above

        let specialConsiderations = $("td[bgcolor='DFEBF2'] > table > tbody > tr:nth-child(2) > td > .intro").text().trim();
        specialConsiderations = removeSpace(specialConsiderations);
        //returns Tolerates:frostSpecial characteristics:non-aggressivenon-invasivenot native to North America - Hybrids of plants native to Europe.Special uses:edible flowers - Used as decorations and garnishes.
    });
};

// flowers
main("http://www.gardening.cornell.edu/homegardening/scenee139.html");

// vegetables

