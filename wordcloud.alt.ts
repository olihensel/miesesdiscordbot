import axios from 'axios';
import { chromium } from 'playwright';

async function createWordCloud(words: { val: string; count: number }[]) {
  const { Canvas } = require('skia-canvas');

  const WordCloud = require('node-wordcloud')((w: number, h: number) => new Canvas(w, h));
  const canvas = new Canvas(500, 500);

  const wordcloud = WordCloud(canvas, { list: words.map((w) => [w.val, w.count]) });
  // dark gray

  // you should call draw() to draw the wordcloud manually
  wordcloud.draw();

  return await canvas.toBuffer('image/png');
}

async function createWordCloud2(words: { val: string; count: number }[]) {
  const browser = await chromium.launch({
    headless: true,
  });
  const page = await browser.newPage({
    viewport: {
      width: 1080,
      height: 1080,
    },
    deviceScaleFactor: 2,
  });
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

  await page.setContent(`
  <html>
  <head>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji">

  <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/5.16.0/d3.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/d3-cloud/1.2.5/d3.layout.cloud.min.js"></script>
  </head>
  <body>
  <div id="wordcloud"></div>
  <script>
  var fill = d3.scale.category20();
  var layout = d3.layout.cloud()
  .size([500, 500])
  .words([
    ${words.map((w) => `{text: "${w.val}", size: ${w.count}}`).join(',')}
    ])
    .padding(5)
      
    .rotate(function() { return ~~(Math.random() * 2) * 90; })
    .font('Impact, "Noto Color Emoji"')
    .text(function(d) { return d.text; })
    .fontSize(function(d) { return d.size; })
    .on("end", draw);
    layout.start();
    function draw(words) {
      scale = e ? Math.min(w / Math.abs(e[1].x - w / 2), w / Math.abs(e[0].x - w / 2), h / Math.abs(e[1].y - h / 2), h / Math.abs(e[0].y - h / 2)) / 2 : 1,

      d3.select("#wordcloud").append("svg")
      .attr("width", layout.size()[0])
      .attr("height", layout.size()[1])
      .append("g")
      
      .fill(fill)
      .attr("transform", "translate(" + layout.size()[0] / 2 + "," + layout.size()[1] / 2 + ")")
      .selectAll("text")
      .data(words)
      .enter().append("text")
      .style("font-size", function(d) { return d.size + "px"; })
      .style("font-family", 'Impact, "Noto Color Emoji"')
      .attr("text-anchor", "middle")
      .attr("transform", function(d) {
        return "translate(" + [d.x, d.y] + ")rotate(" + d.rotate + ")";
      })
      .text(function(d) { return d.text; });

      // d3.scale(scale);
    }
    
  </script>
  </body>
  </html>
  `);

  await page.waitForTimeout(1000);
  const buffer = await page.screenshot({ type: 'png', fullPage: true });
  await page.close();
  await browser.close();
  return buffer;
}

async function createWordCloud3(words: { val: string; count: number }[]): Promise<Buffer> {
  // Set up a headless browser instance using Playwright
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Set the viewport size to 800x600
  await page.setViewportSize({ width: 800, height: 800 });

  await page.addStyleTag({ url: 'https://fonts.googleapis.com/css2?family=Noto+Color+Emoji' });
  // Load the D3 library and the d3-cloud library
  await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.17/d3.js' });
  await page.waitForFunction(`typeof d3 !== 'undefined'`);
  await page.evaluate((await axios.get('https://raw.githubusercontent.com/cesine/d3-cloud/master/build/d3.layout.cloud.js')).data);
  // Generate the data for the word cloud
  const data = words.slice(0, 25).map((word) => ({ word: word.val, value: word.count }));
  // Wait for the page to load the D3 library and the d3-cloud library
  // Generate the layout for the word cloud
  await page.evaluate(`
  var fill = d3.scale.category20();

window.makeWordCloud = function(data, parent_elem, svgscale, svg_class, font, rotate_word, my_colors){

      function draw(words) {
        d3.select(parent_elem).append("svg")
            .attr("width", svgscale)
            .attr("height", svgscale)
            .attr("class", svg_class)
          .append("g")
            .attr("transform", "translate(" + svgscale / 2 + "," + svgscale / 2 + ")")
          .selectAll("text")
            .data(words)
          .enter().append("text")
            .style("font-size", function(d) { return d.size + "px"; })
            .style("font-family", font)
            .style("fill", function(d, i) { if(my_colors){ return my_colors(i); }else{ return fill(i); } })
            .attr("text-anchor", "middle")
            .attr("transform", function(d) {
              return "translate(" + [d.x, d.y] + ")rotate(" + d.rotate + ")";
            })
            .text(function(d) { return d.text; });
      }

      if(svg_class){ d3.select("." + svg_class).remove() }
      else{ d3.select("svg").remove() }

      var data_max =  d3.max(data, function(d){ return d.value } );
      var sizeScale = d3.scale.linear().domain([0, data_max]).range([0, 1])

      data = data.map(function(d) {
        return {text: d.word, size: 10 + sizeScale(d.value) * 90};
      })

      var layout = d3.layout.cloud().size([svgscale, svgscale])
        .words(data)
        .padding(5)
        .fontSize(function(d) { return d.size; })
        
      layout.rotate(function() { return (Math.random() - 0.5) * 5; }) 
        
      layout
        .on("end", draw)
        .start();
  }

  window.makeWordCloud(${JSON.stringify(data)}, "body", 800, "", 'Impact, "Noto Color Emoji", sans-serif');
  `);

  // Take a screenshot of the rendered word cloud
  const screenshot = await page.screenshot();

  // Close the browser instance
  await browser.close();

  // Return the screenshot as a Buffer
  return screenshot;
}
