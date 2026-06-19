import { http_get, http_post } from "../utils/network.js";
import { loadExtractor } from "../utils/extractors.js";

const baseUrl = "https://tellyhd.media";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    const year = new Date().getFullYear();
    return [
        { title: "Latest", list: await getPage(`${baseUrl}/release/${year}/`) },
        { title: "USA", list: await getPage(`${baseUrl}/genre/usa/`) },
        { title: "JAV", list: await getPage(`${baseUrl}/genre/jav/`) },
        { title: "Bindastimes", list: await getPage(`${baseUrl}/genre/bindastimes/`) },
        { title: "Hunters", list: await getPage(`${baseUrl}/genre/hunters/`) },
        { title: "Primeplay", list: await getPage(`${baseUrl}/genre/primeplay/`) }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/search/${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseSearchList(res);
}

function getProperLink(uri) {
    if (uri.includes("/episodes/")) {
        const titleMatch = uri.match(/\/episodes\/([^/]+)-season/);
        if (titleMatch) return `${baseUrl}/tvshows/${titleMatch[1]}`;
    } else if (uri.includes("/seasons/")) {
        const titleMatch = uri.match(/\/seasons\/([^/]+)-season/);
        if (titleMatch) return `${baseUrl}/tvshows/${titleMatch[1]}`;
    }
    return uri;
}

function parseList(html) {
    const results = [];
    const items = html.split(/<article[^>]*>/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<h3[^>]*>\s*<a[^>]+href=["']([^"']+)["']/i) || item.match(/<a[^>]+href=["']([^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/<h3[^>]*>\s*<a[^>]*>(.*?)<\/a>/i);
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
        
        let imgMatch = item.match(/<div class=["']poster["'][^>]*>[\s\S]*?<img[^>]+data-src=["']([^"']+)["']/i) || 
                       item.match(/<div class=["']poster["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i) ||
                       item.match(/<img[^>]+src=["']([^"']+)["']/i);
                       
        let url = getProperLink(aTag[1]);

        results.push({
            url: url,
            title: title,
            poster: imgMatch ? imgMatch[1] : ''
        });
    }
    return results;
}

function parseSearchList(html) {
    const results = [];
    const items = html.split(/class=["']result-item["']/i);
    for(let i=1; i<items.length; i++) {
        const item = items[i];
        let aTag = item.match(/class=["']title["'][^>]*>\s*<a[^>]+href=["']([^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/class=["']title["'][^>]*>\s*<a[^>]*>(.*?)<\/a>/i);
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\(\d{4}\)/, '').trim() : "Unknown";
        
        let imgMatch = item.match(/<img[^>]+src=["']([^"']+)["']/i);
        
        results.push({
            url: getProperLink(aTag[1]),
            title: title,
            poster: imgMatch ? imgMatch[1] : ''
        });
    }
    return results;
}

export async function load(url) {
    const res = await http_get(url, getHeaders());
    
    let title = url;
    const titleMatch = res.match(/<div class=["']data["'][^>]*>\s*<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let poster = "";
    const posterMatch = res.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
    if(posterMatch) poster = posterMatch[1];
    
    const episodes = [];
    const trMatches = res.match(/<ul id=["']playeroptionsul["'][^>]*>([\s\S]*?)<\/ul>/i);
    if(trMatches) {
        const lis = trMatches[1].split(/<li/i);
        for(let i=1; i<lis.length; i++) {
             const li = lis[i];
             const typeMatch = li.match(/data-type=["']([^"']+)["']/);
             const postMatch = li.match(/data-post=["']([^"']+)["']/);
             const numeMatch = li.match(/data-nume=["']([^"']+)["']/);
             const nameMatch = li.match(/<span class=["']title["'][^>]*>(.*?)<\/span>/i);
             
             if(typeMatch && postMatch && numeMatch && nameMatch) {
                  let name = nameMatch[1].replace(/<[^>]+>/g, '').trim();
                  if(name.toLowerCase().includes("trailer") || name.toLowerCase().includes("dood")) continue;
                  
                  let parts = [typeMatch[1], postMatch[1], numeMatch[1]].join("::");
                  episodes.push({
                      url: `ajax_tolly::${parts}`,
                      title: name,
                      poster: poster
                  });
             }
        }
    }
    
    if(episodes.length === 0) {
         episodes.push({
             url: url,
             title: title,
             poster: poster
         });
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
    if(url.startsWith("ajax_tolly::")) {
         const parts = url.substring(12).split("::");
         const type = parts[0];
         const post = parts[1];
         const nume = parts[2];
         
         const ajaxUrl = `${baseUrl}/wp-admin/admin-ajax.php`;
         const postData = `action=doo_player_ajax&post=${post}&nume=${nume}&type=${type}`;
         
         const res = await http_post(ajaxUrl, {
             "Content-Type": "application/x-www-form-urlencoded",
             "Referer": baseUrl,
             "X-Requested-With": "XMLHttpRequest",
             "Accept": "*/*"
         }, postData);
         
         try {
             const data = JSON.parse(res);
             if (data.embed_url) {
                 let embed = data.embed_url;
                 const iframeMatch = embed.match(/src=["']([^"']+)["']/);
                 if (iframeMatch) {
                     embed = iframeMatch[1];
                 }
                 if(embed.startsWith("//")) embed = "https:" + embed;
                 return await loadExtractor(embed);
             }
         } catch(e) {}
    } else {
         const res = await http_get(url, getHeaders());
         const iframeMatch = res.match(/<iframe[^>]+src=["']([^"']+)["']/i);
         if(iframeMatch && !iframeMatch[1].includes("youtube")) {
              let embed = iframeMatch[1];
              if(embed.startsWith("//")) embed = "https:" + embed;
              return await loadExtractor(embed);
         }
    }
    return [];
}
