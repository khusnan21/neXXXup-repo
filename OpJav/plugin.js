import { http_get, http_post } from "../utils/network.js";
import { loadExtractor } from "../utils/extractors.js";

const baseUrl = "https://opjav.com";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    const res = await http_get(baseUrl, getHeaders());
    const resultsOuter = parseListOuter(res);
    return resultsOuter;
}

export async function search(query) {
    const url = `${baseUrl}/search/${encodeURIComponent(query)}/`;
    const res = await http_get(url, getHeaders());
    return parseListInner(res, "<div class=\"block-body\">");
}

function parseListOuter(html) {
    const results = [];
    const contents = html.split(/class=["']content["']/i);
    for (let c = 1; c < contents.length; c++) {
        const content = contents[c];
        
        // Find section title if present
        let sectionName = "Latest";
        // Attempt to find simple list
        let simpleItems = content.match(/<div class=["']list-film-simple["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
        if (simpleItems) {
            let list = parseListInnerSimple(simpleItems[1]);
            if(list.length > 0) results.push({ title: `List ${c}`, list: list });
            continue;
        }
        
        let rowItems = content.match(/<div class=["']list-film row["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
        if (rowItems) {
            let list = parseListInner(rowItems[1]);
            if(list.length > 0) results.push({ title: `List ${c}`, list: list });
        }
    }
    return results;
}

function parseListInnerSimple(html) {
    const results = [];
    const items = html.split(/class=["']item["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/i) || item.match(/href=["']([^"']+)["']/i);
        if(!aTag) continue;
        
        let nameMatch = item.match(/<div class=["']info["'][^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>/i);
        let title = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
        
        let imgMatch = item.match(/<img[^>]+src=["']([^"']+)["']/i) || item.match(/<img[^>]+data-src=["']([^"']+)["']/i);
        
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

function parseListInner(html) {
    const results = [];
    const items = html.split(/class=["']inner["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+class=["'][^"']*poster[^"']*["'][^>]+href=["']([^"']+)["']/i) || item.match(/<a[^>]+href=["']([^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/title=["']([^"']+)["']/i);
        let title = titleMatch ? titleMatch[1].replace("Watch JAV", "").replace("HD", "").trim() : "Unknown";
        
        let imgMatch = item.match(/<img[^>]+src=["']([^"']+)["']/i) || item.match(/<img[^>]+data-src=["']([^"']+)["']/i);
        
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
    const titleMatch = res.match(/<meta property=["']og:title["'] content=["']([^"']+)["']/i);
    if(titleMatch) {
        title = titleMatch[1].replace("Watch JAV", "").trim();
    }
    
    let poster = "";
    const posterMatch = res.match(/<meta itemprop=["']image["'] content=["']([^"']+)["']/g);
    if(posterMatch && posterMatch.length > 1) {
        poster = posterMatch[1].match(/content=["']([^"']+)["']/)[1];
    } else {
        const ogImage = res.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
        if (ogImage) poster = ogImage[1];
    }
    
    let links = [];
    const watchLinkMatch = res.match(/<div class=["']buttons row["'][^>]*>\s*<a[^>]+href=["']([^"']+)["']/i);
    if (watchLinkMatch) {
         let wLink = watchLinkMatch[1];
         if(!wLink.startsWith("http")) wLink = baseUrl + wLink;
         
         const wRes = await http_get(wLink, getHeaders());
         const serverLis = wRes.match(/<div class=["']block servers["'][^>]*>[\s\S]*?<\/ul>/i);
         if(serverLis) {
             const aTags = serverLis[0].match(/<a[^>]+id=["']([^"']+)["'][^>]+href=["']([^"']+)["']/gi);
             if (aTags) {
                 for(let a of aTags) {
                      const idMatch = a.match(/id=["']([^"']+)["']/);
                      const hrefMatch = a.match(/href=["']([^"']+)["']/);
                      if(idMatch && hrefMatch) {
                          links.push(`ajax_opjav::${idMatch[1]}::${hrefMatch[1]}`);
                      }
                 }
             }
         }
    }

    if(links.length === 0) links.push(url);

    return {
        url: url,
        title: title,
        poster: poster,
        links: links,
        isMovie: true
    };
}

export async function loadLinks(url) {
    let target = url;
    if(url.startsWith("ajax_opjav::")) {
         const parts = url.split("::");
         const linkId = parts[1];
         const linkUrl = parts[2];
         
         const ajaxUrl = `${baseUrl}/ajax`;
         const postData = `NextEpisode=1&EpisodeID=${linkId}`;
         
         const res = await http_post(ajaxUrl, {
             "Content-Type": "application/x-www-form-urlencoded",
             "Referer": linkUrl,
             "Origin": baseUrl,
             "User-Agent": getHeaders()["User-Agent"]
         }, postData);
         
         const iframeMatch = res.match(/<iframe[^>]+src=["']([^"']+)["']/i);
         if(iframeMatch) {
              target = iframeMatch[1];
         } else {
             return [];
         }
    }
    
    if(target.startsWith("//")) target = "https:" + target;

    if(target.includes("opmovie.xyz")) {
         target = target.replace("opmovie.xyz", "fcdn.stream"); // standard XStreamCdn mapping
    }
    
    return await loadExtractor(target);
}
