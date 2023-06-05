require("dotenv").config();
const { Pool } = require("pg");
const axios = require("axios");
const cheerio = require("cheerio");
const s = require("string");

// may need to check for null values, empty strings, empty arrays etc before sending data to postgres
// assume all array are either populated or empty?

// connect to PostgreSQL db
const pool = new Pool({
    user: process.env.PG_USER,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
    host: process.env.PG_HOST
});

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

        const id = link.slice(-9, -5);

        /// TOP ///
        let name = $(".head2 p").text();
        name = s(name).collapseWhitespace();
        name = name.orig;

        let categories = $(".normal p:nth-child(1)").text().split(",");
        categories = categories.map(category => {
            category = s(category.trim()).collapseWhitespace();
            return category.orig;
        });
        // returns: [ 'Herbaceous Perennial Flower', 'Wildflower' ]

        let alt_names = $(".normal p:nth-child(2)").text().trim();
        // replacing all newlines with a comma, which yields series of 8 commas to be replaced in all locations with a single comma (the delimiter)
        alt_names = alt_names.replace(/(\r\n|\n|\r)/g, ",");
        alt_names = alt_names.replace(/,,,,,,,,/g, ",");
        alt_names = alt_names.split(',');
        alt_names = alt_names.map(name => {
            return name.trim().replace("Also known as ", "").replace("Synonym: ", "");
        });
        // returns: [
        //   'Common Zinnia',
        //   'Zinnia elegans medium height',
        //   'Asteraceae Family'
        // ]
        
        const description = $(".normal p:nth-child(3)").text().trim();

        /// BOTTOM ///

        // SITE CHARACTERISTICS //
        let siteCharacText = $("a[name='profile'] + table .intro:nth-child(1)").text().trim();
        siteCharacText = s(siteCharacText).collapseWhitespace();
        siteCharacText = siteCharacText.orig;

        let sunlight_summary = [];
        let sunlight = s(siteCharacText).between("Sunlight:", "Soil conditions:");
        if (sunlight.orig.includes("full sun")) sunlight_summary.push("full sun");
        if (sunlight.orig.includes("part shade")) sunlight_summary.push("part shade");
        if (sunlight.orig.includes("full shade")) sunlight_summary.push("full shade");
        // returns [ 'full sun', 'part shade' ], may also be an empty array
        
        let sunlight_detail;
        const lastSunlight = sunlight_summary[sunlight_summary.length - 1];
        if (lastSunlight) {
            sunlight_detail = s(siteCharacText).between(lastSunlight, "Soil conditions:").collapseWhitespace();
            sunlight_detail = sunlight_detail.orig;
            // returns either a string or nothing
        };

        // looks specifically for the bullets - great if you don't need the extra info at the bottom of the section
        let soil_conditions = [];
        let $soilConditions = $("p:has(b:contains('Soil conditions:')) + ul li");
        $soilConditions.each((index, condition) => soil_conditions.push($(condition).text().trim().toLowerCase()));
        // returns: [
        //   'tolerates droughty soil',
        //   'requires well-drained soil',
        //   'tolerates low fertility'
        // ]

        let hardiness_zones;
        if (siteCharacText.includes("Hardiness zones:")) {
            let hardinesszones = $("p:has(b:contains('Hardiness zones:')) + ul li").text().trim();
            hardiness_zones = hardinesszones.split(" to ").map(string => Number(string));
            // returns [ 4, 7 ]
        } else {
            hardiness_zones = [];
            // or an empty array
        };

        // PLANT TRAITS //
        // both the section element and its text available
        let $plantTraits = $("td[bgcolor='F0F6E6'] > table > tbody > tr:nth-child(2) > td > .intro");
        let plantTraitsText = s($plantTraits.text().trim()).collapseWhitespace();

        let lifecycle = s($plantTraits.find("p:first").text()).collapseWhitespace();
        lifecycle = lifecycle.orig.replace("Lifecycle: ", "").split(", ");
        // returns [ 'biennial', 'perennial' ]

        let lifecycle_detail;
        const lifecycleAdditional = s($plantTraits.find("p:nth-child(2)").text()).collapseWhitespace();
        if (!lifecycleAdditional.orig.includes("Ease-of-care") && !lifecycleAdditional.orig.includes("Height:")) {
            lifecycle_detail = lifecycleAdditional.orig;
            // returns: Evergreen subshrub. Usually dies back to the ground.
        };

        let ease_of_care;
        let easeOfCareText = s(plantTraitsText).between("Ease-of-care: ", "Height:");
        if (easeOfCareText.includes("easy")) ease_of_care = "easy";
        if (easeOfCareText.includes("difficult")) ease_of_care = "difficult";
        if (easeOfCareText.includes("moderately difficult")) ease_of_care = "moderately difficult";
        // returns "moderately difficult"

        let height = s(plantTraitsText).between("Height: ", "Spread: ").collapseWhitespace();
        height = height.split(/to|feet/).slice(0, 2);
        height = height.map(string => Number(string));
        // returns [ 0.04, 0.16 ] (always in feet)

        let spread = s(plantTraitsText).between("Spread: ", "Bloom time:").collapseWhitespace();
        spread = spread.split(/to|feet/).slice(0, 2);
        spread = spread.map(string => Number(string));
        // returns [ 0.33, 1 ] (always in feet)

        let bloom_time = [];
        let $bloomTime = $("p:has(b:contains('Bloom time:')) + ul li");
        $bloomTime.each((index, time) => bloom_time.push($(time).text().trim()));
        // returns [ 'mid-summer', 'late summer', 'early fall', 'mid-fall' ]

        let flower_colors = [];
        let $flowerColors = $("p:has(b:contains('Flower color:')) + ul li");
        $flowerColors.each((index, color) => flower_colors.push($(color).text().trim()));
        // returns [ 'yellow', 'violet', 'white', 'pink' ]

        let foliageColors = s(plantTraitsText).between("Foliage color: ", "Foliage texture:");
        foliageColors = foliageColors.orig.split("green");
        let foliage_colors = [];
        foliageColors.forEach(color => {
            color = color.replace("-", "").replace(",", "").trim();
            if (color !== "" && color !== "." && color.length <= 6) foliage_colors.push(color);
        });
        // returns [ 'medium', 'dark' ]

        // SPECIAL CONSIDERATIONS //
        let $specialConsiderations = $("td[bgcolor='DFEBF2'] > table > tbody > tr:nth-child(2) > td > .intro");

        let special_char = [];
        let $specialCharacteristics = $specialConsiderations.find("b:contains('Special characteristics:') + ul li");
        $specialCharacteristics.each((index, char) => special_char.push($(char).text().trim()));
        special_char = special_char.map(char => s(char).collapseWhitespace().orig);
        // returns [
        //     'deer resistant',
        //     'non-aggressive',
        //     'non-invasive',
        //     'not native to North America - Native to Mexico.'
        // ]

        let attracts = [];
        let $attracts = $specialConsiderations.find("b:contains('Attracts:') + ul li");
        $attracts.each((index, attraction) => attracts.push($(attraction).text().trim()));
        attracts = attracts.map(char => s(char).collapseWhitespace().orig);
        // returns [ 'butterflies', 'hummingbirds' ]

        // inserting data
        try {
            await pool.query(
                "INSERT INTO flower_data (id, name, categories, alt_names, description, sunlight_summary, sunlight_detail, soil_conditions, hardiness_zones, lifecycle, lifecycle_detail, ease_of_care, height, spread, bloom_time, flower_colors, foliage_colors, special_char, attracts) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)",
                [id, name, categories, alt_names, description, sunlight_summary, sunlight_detail, soil_conditions, hardiness_zones, lifecycle, lifecycle_detail, ease_of_care, height, spread, bloom_time, flower_colors, foliage_colors, special_char, attracts]
            );
            console.log("Data loaded.");
        } catch(err) {
            console.error(err);
        };
    });
};

// flowers
main("http://www.gardening.cornell.edu/homegardening/scenee139.html");

// pull data
// async function retrieveSoilConditions() {
//     try {
//         const res = await pool.query("SELECT soil_conditions FROM data");
//         res.rows.forEach(row => console.log(row.soil_conditions));
//     } catch (err) {
//         console.error(err);
//     };
// };

// retrieveSoilConditions();