import { http_get, http_post } from "../utils/network.js";
import { loadExtractor } from "../utils/extractors.js";

const baseUrl = "https://pinkueiga.net";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Movies", list: await getPage(baseUrl + "/movies/") },
        { title: "Trending", list: await getPage(baseUrl + "/trending/") }
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
    const items = html.split(/class=["'][^"']*thumb[^"']*["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]*class=["'][^"']*halim-thumb[^"']*["'][^>]*href=["'](https?:\/\/[^"']+)["']/i) || item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/<h2[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>(.*?)<\/h2>/i) || item.match(/title=["']([^"']+)["']/i);
        let imgMatch = item.match(/<img[^>]+data-src=["']([^"']+)["']/i) || item.match(/<img[^>]+src=["']([^"']+)["']/i);
        
        if (aTag) {
            let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
            let url = aTag[1];
            results.push({
                url: url,
                title: title,
                poster: imgMatch ? imgMatch[1] : ''
            });
        }
    }
    return results;
}

export async function load(url) {
    const res = await http_get(url, getHeaders());
    
    let title = url;
    const titleMatch = res.match(/<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let poster = "";
    const imgMatch = res.match(/<img[^>]*class=["'][^"']*movie-thumb[^"']*["'][^>]*src=["']([^"']+)["']/i);
    if(imgMatch) poster = imgMatch[1];
    if(poster && !poster.startsWith("http")) poster = baseUrl + poster;
    
    const epMatch = res.match(/<ul[^>]*class=["'][^"']*halim-list-eps[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i);
    const episodes = [];
    if(epMatch) {
        const epLis = epMatch[1].split(/<li/i);
        for(let i=1; i<epLis.length; i++) {
             let a = epLis[i].match(/<a[^>]+href=["']([^"']+)["']/i) || epLis[i].match(/data-href=["']([^"']+)["']/i);
             if(a) {
                  let epurl = a[1];
                  if(!epurl.startsWith("http")) epurl = baseUrl + epurl;
                  
                  let epN = epLis[i].match(/<span[^>]*>(.*?)<\/span>/i);
                  episodes.push({
                      url: epurl,
                      title: epN ? epN[1].trim() : "",
                      poster: poster
                  });
             }
        }
    }
    
    if(episodes.length === 0) {
        const watchUrl = res.match(/<a[^>]*class=["'][^"']*watch-movie[^"']*["'][^>]*href=["']([^"']+)["']/i);
        if(watchUrl) {
             episodes.push({
                  url: watchUrl[1],
                  title: title,
                  poster: poster
             });
        } else {
             episodes.push({
                  url: url,
                  title: title,
                  poster: poster
             });
        }
    }

    return {
        url: url,
        title: title,
        poster: poster,
        isMovie: episodes.length <= 1,
        episodes: episodes
    };
}

export async function loadLinks(url) {
    const res = await http_get(url, getHeaders());
    const results = [];
    
    const nonceMatch = res.match(/data-nonce=["']([^"']+)["']/i);
    const postidMatch = res.match(/"post_id"\s*:\s*(\d+)/i) || res.match(/post_id\s*:\s*"?(\d+)"?/i);
    const serveridMatch = res.match(/"server"\s*:\s*"(\d+)"/i) || res.match(/server\s*:\s*"(\d+)"/i);
    
    let episodeslug = url.replace(/\/$/, '').split('/').pop().replace(".html", "");
    if(episodeslug.includes("-sv")) episodeslug = episodeslug.split("-sv")[0];
    
    if(nonceMatch && postidMatch) {
         const postData = `episode_slug=${episodeslug}&server_id=${serveridMatch ? serveridMatch[1] : "1"}&subsv_id=&post_id=${postidMatch[1]}&nonce=${nonceMatch[1]}&custom_var=`;
         const pRes = await http_get(`${baseUrl}/wp-content/themes/halimmovies/player.php?` + postData, {
             "X-Requested-With": "XMLHttpRequest",
             "Referer": url,
             ...getHeaders()
         });
         
         const fileMatch = pRes.match(/"file"\s*:\s*"([^"]+)"/i);
         if(fileMatch) {
             results.push({
                 url: fileMatch[1].replace(/\\\//g, '/'),
                 quality: "720p",
                 isM3U8: fileMatch[1].includes(".m3u8")
             });
         }
    }
    
    return results;
}
