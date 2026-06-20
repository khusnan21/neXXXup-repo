
const baseUrl = "https://xprimehub.vip";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Home", list: await getPage(baseUrl + "/page/1") },
        { title: "Ullu", list: await getPage(baseUrl + "/c/ullu-originals/page/1") },
        { title: "Bindastimes", list: await getPage(baseUrl + "/c/bindastimes/page/1") },
        { title: "Kooku", list: await getPage(baseUrl + "/c/kooku/page/1") },
        { title: "PrimeShots", list: await getPage(baseUrl + "/c/primeshots/page/1") },
        { title: "Primeflix", list: await getPage(baseUrl + "/c/primeflix/page/1") },
        { title: "Rabbit", list: await getPage(baseUrl + "/c/rabbit/page/1") }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/search/${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["']bw_thumb_title["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<h1[^>]*>\s*<a[^>]+href=["']([^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/<h1[^>]*>\s*<a[^>]*>(.*?)<\/a>/i);
        let title = "Unknown";
        if (titleMatch) {
            title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            if(title.includes("[18+]")) title = title.split("[18+]")[1].trim();
            if(title.includes("UNRATED")) title = title.split("UNRATED")[0].trim();
        }
        
        // This is tricky: bw_thumb img is usually before bw_thumb_title in the document structure.
        // It's better to split by bw_thumb and parse within it. But whatever, trying to extract properly.
        let imgContext = html.substring(Math.max(0, html.indexOf(item) - 1500), html.indexOf(item) + 50);
        let imgMatch = imgContext.match(/class=["']bw_thumb["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i) || imgContext.match(/class=["']bw_thumb["'][^>]*>[\s\S]*?<img[^>]+data-src=["']([^"']+)["']/i);
        
        let url = aTag[1];
        if(!url.startsWith("http")) url = baseUrl + url;

        results.push({
            url: url,
            title: title,
            poster: imgMatch ? imgMatch[1] : ''
        });
    }
    return results;
}

export async function load(url) {
    const res = await http_get(url, getHeaders());
    
    let title = url;
    const titleMatch = res.match(/<title>([\s\S]*?)<\/title>/i);
    if(titleMatch) {
         title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
         if(title.includes("[18+]")) title = title.split("[18+]")[1].trim();
         if(title.includes("UNRATED")) title = title.split("UNRATED")[0].trim();
    }
    
    let poster = "";
    
    const episodes = [];
    
    // Find buttons
    const btnRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>\s*<button[^>]*class=["'][^"']*btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi;
    let m;
    while((m = btnRegex.exec(res)) !== null) {
         let href = m[1];
         let btnText = m[2];
         if(href && href.startsWith("http")) {
              episodes.push({
                  url: href,
                  title: btnText.replace(/<[^>]+>/g, "").trim(),
                  poster: poster
              });
         }
    }
    
    if(episodes.length === 0) episodes.push({ url: url, title: title, poster: poster });
    
    return {
        url: url,
        title: title,
        poster: poster,
        isMovie: episodes.length <= 1,
        episodes: episodes
    };
}

export async function loadLinks(url) {
    // URL here is the href of the download button page
    const res = await http_get(url, getHeaders());
    const results = [];
    
    const btnRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>\s*<button[^>]*class=["'][^"']*btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi;
    let m;
    while((m = btnRegex.exec(res)) !== null) {
         let href = m[1];
         let btnText = m[2].replace(/<[^>]+>/g, "").trim();
         
         const excluded = ["Filepress", "GDToT", "DropGalaxy"];
         let isExcluded = excluded.some(x => btnText.toLowerCase().includes(x.toLowerCase()));
         
         if(!isExcluded && href.startsWith("http")) {
              const extr = await loadExtractor(href);
              if (extr) {
                  extr.forEach(e => {
                       e.quality = btnText || e.quality; // use btnText as quality hint
                       results.push(e);
                  });
              }
         }
    }
    
    return results;
}
