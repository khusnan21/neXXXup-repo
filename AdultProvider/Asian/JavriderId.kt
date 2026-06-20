package com.lagradost.cloudstream3.AdultProvider.Asian

import com.lagradost.api.Log
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.TvType
import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.app
import com.lagradost.cloudstream3.LoadResponse.Companion.addActors
import com.lagradost.cloudstream3.utils.ExtractorLink
import com.lagradost.cloudstream3.utils.extractorApis
import com.lagradost.cloudstream3.utils.loadExtractor
import com.lagradost.cloudstream3.utils.newExtractorLink
import com.lagradost.cloudstream3.utils.M3u8Helper.Companion.generateM3u8
import com.lagradost.cloudstream3.utils.Qualities
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.net.URLDecoder
import java.net.URLEncoder
import java.util.Base64
import com.fasterxml.jackson.annotation.JsonProperty

class JavriderId : MainAPI() {
    override var mainUrl = "https://javrider.id"
    override var name = "Javrider Id"
    override var lang = "id"
    override val hasMainPage = true
    override val hasQuickSearch = true
    override val supportedTypes = setOf(TvType.NSFW)

    private val headers = mapOf<String, String>(
        "User-Agent" to "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept" to "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language" to "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Sec-Fetch-Dest" to "document",
        "Sec-Fetch-Mode" to "navigate",
        "Sec-Fetch-Site" to "same-origin",
        "Upgrade-Insecure-Requests" to "1",
        "Referer" to "$mainUrl/"
    )

    private fun getHeadersWithReferer(referer: String): Map<String, String> {
        return headers.toMutableMap().apply {
            this["Referer"] = referer
        }
    }

    override val mainPage = mainPageOf(
        "" to "Terbaru",
        "category/censored-id" to "Censored Id",
        "category/fc2" to "FC2",
        "category/subtitle-id" to "Subtitle Id"
    )

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse {
        val url = buildPageUrl(request.data, page)
        val document = app.get(url, headers = headers, timeout = 30L).document
        val results = parseCards(document).distinctBy { it.url }

        return newHomePageResponse(
            HomePageList(request.name, results, isHorizontalImages = true),
            hasNext = hasNextPage(document, page) || results.isNotEmpty()
        )
    }

    private fun buildPageUrl(data: String, page: Int): String {
        val clean = data.trim().trim('/')

        return when {
            clean.isBlank() && page <= 1 -> mainUrl
            clean.isBlank() -> "$mainUrl/page/$page/"

            clean.startsWith("http", ignoreCase = true) -> {
                if (page <= 1) clean else clean.trimEnd('/') + "/page/$page/"
            }

            page <= 1 -> "$mainUrl/$clean/"
            else -> "$mainUrl/$clean/page/$page/"
        }
    }

    private fun parseCards(document: Document): List<SearchResponse> {
        val results = linkedMapOf<String, SearchResponse>()

        val selectors = listOf<String>(
            "article.loop-video.thumb-block",
            "article.loop-video",
            "article.thumb-block",
            "article.video-preview-item",
            "article",
            "div.item",
            "div.post",
            "li.pcVideoListItem"
        )

        for (selector in selectors) {
            val elements = ArrayList<Element>(document.select(selector))
            for (i in 0 until elements.size) {
                val element = elements.get(i)
                val item = element.toSearchResult()
                if (item != null) {
                    results[item.url] = item
                }
            }
        }

        if (results.isEmpty()) {
            val alternatives = ArrayList<Element>(document.select("article:has(a[href]):has(img), .post:has(a[href]):has(img), a[href:hasImg], a[href]:has(img)"))
            for (i in 0 until alternatives.size) {
                val element = alternatives.get(i)
                val item = element.toSearchResult()
                if (item != null) {
                    results[item.url] = item
                }
            }
        }

        return results.values.toList()
    }

    private fun Element.toSearchResult(): SearchResponse? {
        val anchor = if (this.`is`("a[href]")) {
            this
        } else {
            selectFirst("a[href][title], a[href]:has(img), h2 a[href], h3 a[href], .entry-header a[href], a[href]")
                ?: return null
        }

        val href = fixUrlNull(anchor.attr("href")) ?: return null
        if (!href.startsWith(mainUrl, ignoreCase = true)) return null
        if (isBlockedUrl(href)) return null

        val image = selectFirst("img") ?: anchor.selectFirst("img")
        
        val titleList = mutableListOf<String>()
        val parentTitle = anchor.attr("title")
        if (parentTitle.isNotBlank()) titleList.add(parentTitle)
        
        val headerSpan = selectFirst(".entry-header span")
        if (headerSpan != null) {
            val text = headerSpan.text()
            if (text.isNotBlank()) titleList.add(text)
        }
        
        val heading = selectFirst("h2, h3, .entry-title, .title")
        if (heading != null) {
            val text = heading.text()
            if (text.isNotBlank()) titleList.add(text)
        }
        
        val imgAlt = image?.attr("alt")
        if (imgAlt != null && imgAlt.isNotBlank()) titleList.add(imgAlt)
        
        val anchorText = anchor.text()
        if (anchorText.isNotBlank()) titleList.add(anchorText)
        
        val fallbackTitle = href.substringBeforeLast('/').substringAfterLast('/').replace("-", " ")
        if (fallbackTitle.isNotBlank()) titleList.add(fallbackTitle)

        val title = titleList.firstOrNull { it.isNotBlank() && !isBadTitle(it) }
            ?.cleanTitle()
            ?: return null

        val poster = image?.getImageUrl()

        return newMovieSearchResponse(title, href, TvType.NSFW) {
            posterUrl = poster
            posterHeaders = mapOf("Referer" to mainUrl)
        }
    }

    private fun hasNextPage(document: Document, page: Int): Boolean {
        return document.selectFirst(
            ".pagination a[href*='/page/${page + 1}/'], " +
                ".pagination a.inactive[href], a.next[href], a[rel=next], a[href*='paged=${page + 1}']"
        ) != null
    }

    private fun isBlockedUrl(url: String): Boolean {
        val path = url.substringAfter(mainUrl).trim('/').lowercase()

        if (path.lowercase() == "") return true

        val blocked = listOf<String>(
            "category/",
            "tag/",
            "tags",
            "actor/",
            "actors",
            "wp-content",
            "wp-admin",
            "wp-json",
            "feed",
            "dmca",
            "privacy",
            "contact",
            "login",
            "register"
        )

        return blocked.any { path == it.trimEnd('/') || path.startsWith(it) }
    }

    private fun isBadTitle(title: String): Boolean {
        val clean = title.cleanText()

        return clean.lowercase() == "" ||
            clean.equals("Home", true) ||
            clean.equals("Categories", true) ||
            clean.equals("Tags", true) ||
            clean.equals("Actors", true) ||
            clean.equals("Join Telegram", true) ||
            clean.equals("Javrider Id", true)
    }

    override suspend fun search(query: String, page: Int): SearchResponseList {
        val keyword = query.trim()
        if (keyword.lowercase() == "") return newSearchResponseList(emptyList(), hasNext = false)

        val encoded = URLEncoder.encode(keyword, "UTF-8")
        val url = if (page <= 1) {
            "$mainUrl/?s=$encoded"
        } else {
            "$mainUrl/page/$page/?s=$encoded"
        }

        val document = app.get(url, headers = headers, referer = mainUrl, timeout = 30L).document
        val results = parseCards(document).distinctBy { it.url }

        return newSearchResponseList(
            results,
            hasNext = hasNextPage(document, page) || results.isNotEmpty()
        )
    }

    override suspend fun search(query: String): List<SearchResponse> {
        return search(query, 1).items
    }

    override suspend fun quickSearch(query: String): List<SearchResponse>? {
        return search(query)
    }

    override suspend fun load(url: String): LoadResponse {
        val document = app.get(url, headers = headers, referer = mainUrl, timeout = 30L).document

        val titleList = mutableListOf<String>()
        val entryTitle = document.selectFirst("h1.entry-title")
        if (entryTitle != null) {
            val text = entryTitle.text()
            if (text.isNotBlank()) titleList.add(text)
        }
        val altTitle = document.selectFirst("h1, .title, .film-title")
        if (altTitle != null) {
            val text = altTitle.text()
            if (text.isNotBlank()) titleList.add(text)
        }
        val ogTitle = document.selectFirst("meta[property=og:title]")
        if (ogTitle != null) {
            val content = ogTitle.attr("content")
            if (content.isNotBlank()) titleList.add(content)
        }
        val propName = document.selectFirst("meta[itemprop=name]")
        if (propName != null) {
            val content = propName.attr("content")
            if (content.isNotBlank()) titleList.add(content)
        }
        val fallbackTitle = url.substringBeforeLast('/').substringAfterLast('/').replace("-", " ")
        if (fallbackTitle.isNotBlank()) titleList.add(fallbackTitle)

        val title = titleList.firstOrNull { it.isNotBlank() && !isBadTitle(it) }
            ?.cleanTitle()
            ?: name

        val posterList = mutableListOf<String>()
        val ogImage = document.selectFirst("meta[property=og:image]")
        if (ogImage != null) {
            val content = ogImage.attr("content")
            if (content.isNotBlank()) posterList.add(content)
        }
        val thumbUrl = document.selectFirst(".video-player meta[itemprop=thumbnailUrl]")
        if (thumbUrl != null) {
            val content = thumbUrl.attr("content")
            if (content.isNotBlank()) posterList.add(content)
        }
        val respPlayer = document.selectFirst(".responsive-player")
        if (respPlayer != null) {
            val style = respPlayer.attr("style")
            val extracted = style.extractCssBackgroundUrl()
            if (extracted != null && extracted.isNotBlank()) posterList.add(extracted)
        }
        val artImg = document.selectFirst("article img, .post-thumbnail img, img[data-src], img")
        if (artImg != null) {
            val imageUrl = artImg.getImageUrl()
            if (imageUrl != null && imageUrl.isNotBlank()) posterList.add(imageUrl)
        }
        
        val rawPoster = posterList.firstOrNull()
        val poster = if (rawPoster != null) fixUrlNull(rawPoster) else null

        val descList = mutableListOf<String>()
        val ogDesc = document.selectFirst("meta[property=og:description]")
        if (ogDesc != null) {
            val content = ogDesc.attr("content")
            if (content.isNotBlank()) descList.add(content)
        }
        val descP = document.selectFirst(".video-description .desc p")
        if (descP != null) {
            val text = descP.text()
            if (text.isNotBlank()) descList.add(text)
        }
        val synopsisDiv = document.selectFirst("div.description, div.synopsis, p")
        if (synopsisDiv != null) {
            val text = synopsisDiv.text()
            if (text.isNotBlank()) descList.add(text)
        }
        val entryContentP = document.selectFirst(".entry-content p")
        if (entryContentP != null) {
            val text = entryContentP.text()
            if (text.isNotBlank()) descList.add(text)
        }
        val itemPropDesc = document.selectFirst(".video-player meta[itemprop=description]")
        if (itemPropDesc != null) {
            val content = itemPropDesc.attr("content")
            if (content.isNotBlank()) descList.add(content)
        }

        val rawDesc = descList.firstOrNull()
        val description = rawDesc?.cleanText()

        val year = document.selectFirst("span.year, time, .release-date")?.text()?.split("-")?.firstOrNull()?.toIntOrNull()

        val tags = mutableListOf<String>()
        val tagElements = ArrayList<Element>(document.select("div.tags a, .genres a, .categories a, .tags-list a[href], a[href*='/tag/'], a[href*='/category/']"))
        for (i in 0 until tagElements.size) {
            val element = tagElements.get(i)
            val text = element.text().cleanText()
            if (text.length in 2..40 && !isBadTitle(text)) {
                tags.add(text)
            }
        }
        val distinctTags = tags.distinct().take(20)

        val actors = mutableListOf<Actor>()
        val actorElements = ArrayList<Element>(document.select(".actors a, .cast a, .pstar-list-btn, [itemprop=actor] a, #video-actors a[href*='/actor/'], a[href*='/actor/']"))
        for (i in 0 until actorElements.size) {
            val element = actorElements.get(i)
            val actorName = element.text().cleanText()
            if (actorName.isNotBlank()) {
                val imgElem = element.selectFirst("img")
                actors.add(Actor(actorName, imgElem?.attr("src")))
            }
        }
        val distinctActors = actors.distinctBy { it.name }.take(12)

        val duration = document.selectFirst(".video-player meta[itemprop=duration]")?.attr("content")
            ?.durationToMinutes()
            ?: document.selectFirst("var.duration, span.duration, .time")?.text()?.durationTextToMinutes()

        val recommendations = parseCards(document)
            .filterNot { it.url == url }
            .distinctBy { it.url }
            .take(12)

        return newMovieLoadResponse(title, url, TvType.NSFW, url) {
            posterUrl = poster
            posterHeaders = mapOf("Referer" to mainUrl)
            plot = description
            this.tags = distinctTags
            this.year = year
            this.recommendations = recommendations
            this.duration = duration ?: 0
            addActors(distinctActors)
        }
    }

    override suspend fun loadLinks(
        data: String,
        isCasting: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit
    ): Boolean {
        val document = app.get(data, headers = headers, referer = mainUrl, timeout = 30L).document
        var emitted = false

        collectSubtitles(document, subtitleCallback)

        val candidates = linkedSetOf<String>()
        val embedUrl = document.selectFirst("meta[itemprop=embedURL], meta[itemprop=contentURL]")?.attr("content")
        if (embedUrl != null) {
            candidates.add(embedUrl)
        }

        val pageHtml = document.html()

        val elements = ArrayList<Element>(document.select(
            ".video-player iframe, .play-video iframe, .player iframe, iframe[src], iframe[data-src], iframe[data-lazy-src], " +
            "video[src], source[src], " +
            "li[data-link], li[data-id], li[data-video], " +
            "div[data-link], div[data-src], div[data-video], " +
            "button[data-link], button[data-href], " +
            ".mirror-list a[href], .server-list a[href], a.btn-download[href], a.download[href]"
        ))
        for (i in 0 until elements.size) {
            val element = elements.get(i)
            val attrs = listOf<String>("src", "data-src", "data-lazy-src", "data-url", "href", "data-link", "data-id", "data-video", "value", "data-href")
            for (j in 0 until attrs.size) {
                val attr = attrs.get(j)
                val value = element.attr(attr)
                if (value.isNotBlank() && !value.contains("javascript:") && !value.contains("mailto:")) {
                    val fixed = fixUrlNull(value)
                    if (fixed != null) {
                        candidates.add(fixed)
                    }
                }
            }
        }

        suspend fun emitDirect(url: String, referer: String) {
            if (url.contains(".m3u8", ignoreCase = true)) {
                try {
                    val streamHeaders = getHeadersWithReferer(referer)
                    val links = generateM3u8(
                        source = name,
                        streamUrl = url,
                        referer = referer,
                        headers = streamHeaders
                    )
                    for (link in links) {
                        emitted = true
                        callback(link)
                    }
                } catch (e: Throwable) {
                    Log.e(name, "M3U8 parse failed: ${e.message}")
                }
            } else if (url.contains(".mp4", ignoreCase = true)) {
                emitted = true
                callback(
                    newExtractorLink(name, "$name MP4", url) {
                        this.referer = referer
                        this.quality = Qualities.Unknown.value
                        this.headers = getHeadersWithReferer(referer)
                    }
                )
            }
        }

        suspend fun emitJavPlayers(url: String, referer: String) {
            try {
                val id = url.substringAfterLast("/").substringBefore("?")
                if (id.isBlank()) return
                
                val apiRes = app.post(
                    "https://javplayers.com/player/index.php?data=$id&do=getVideo",
                    headers = mapOf(
                        "User-Agent" to "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
                        "X-Requested-With" to "XMLHttpRequest"
                    ),
                    data = mapOf("hash" to id, "r" to referer),
                    referer = url
                ).parsedSafe<JavPlayersResponse>()
                
                val m3u8 = apiRes?.securedLink ?: apiRes?.videoSource
                if (!m3u8.isNullOrBlank()) {
                    val links = generateM3u8(
                        source = "$name JavPlayers",
                        streamUrl = m3u8,
                        referer = "https://javplayers.com/",
                        headers = mapOf("Referer" to "https://javplayers.com/")
                    )
                    for (link in links) {
                        emitted = true
                        callback(link)
                    }
                }
            } catch (e: Throwable) {
                Log.e(name, "JavPlayers failed: ${e.message}")
            }
        }

        suspend fun emitExtractor(url: String, referer: String) {
            try {
                val cleanReferer = if (url.startsWith(mainUrl) || url.contains("javrider") || url.contains("javplayers")) mainUrl else referer
                loadExtractor(url, cleanReferer, subtitleCallback) { link ->
                    emitted = true
                    // Always ensure we have some headers if it's from a known source
                    val customHeaders = getHeadersWithReferer(cleanReferer)
                    if (link.headers.isEmpty()) {
                        link.headers = customHeaders
                    } else {
                        // Merge headers, prioritizing extractor's but ensuring User-Agent exists
                        val merged = link.headers.toMutableMap()
                        if (!merged.containsKey("User-Agent")) merged["User-Agent"] = headers["User-Agent"]!!
                        link.headers = merged
                    }
                    callback(link)
                }
            } catch (e: Throwable) {
                Log.e(name, "Extractor failed for $url: ${e.message}")
            }
        }

        val playableCandidates = mutableListOf<String>()
        for (cand in candidates) {
            val norm = cand.normalizedCandidate()
            if (norm != null && norm.isPlayableCandidate()) {
                playableCandidates.add(norm)
            }
        }
        val distinctPlayables = playableCandidates.distinct()

        for (candidate in distinctPlayables) {
            if (candidate.isDirectMedia()) {
                emitDirect(candidate, data)
            } else if (candidate.contains("javplayers.com")) {
                emitJavPlayers(candidate, data)
            } else {
                emitExtractor(candidate, data)
            }
        }

        if (!emitted) {
            for (candidate in distinctPlayables) {
                if (candidate.isDirectMedia()) continue
                try {
                    val playerDocument = app.get(candidate, headers = headers, referer = data, timeout = 30L).document
                    collectSubtitles(playerDocument, subtitleCallback)

                    val nestedCandidates = linkedSetOf<String>()
                    val embedElements = ArrayList<Element>(playerDocument.select(
                        "iframe[src], iframe[data-src], iframe[data-lazy-src], " +
                        "video[src], source[src]"
                    ))
                    for (i in 0 until embedElements.size) {
                        val element = embedElements.get(i)
                        val attrs = listOf<String>("src", "data-src", "data-lazy-src", "href", "data-link")
                        for (j in 0 until attrs.size) {
                            val value = element.attr(attrs.get(j))
                            if (value.isNotBlank() && !value.contains("javascript:") && !value.contains("mailto:")) {
                                val fixed = fixUrlNull(value)
                                if (fixed != null) {
                                    nestedCandidates.add(fixed)
                                }
                            }
                        }
                    }

                    val nestedPlayables = mutableListOf<String>()
                    for (nested in nestedCandidates) {
                        val norm = nested.normalizedCandidate()
                        if (norm != null && norm.isPlayableCandidate() && norm != candidate) {
                            nestedPlayables.add(norm)
                        }
                    }

                    for (nested in nestedPlayables.distinct()) {
                        if (nested.isDirectMedia()) {
                            emitDirect(nested, candidate)
                        } else if (nested.contains("javplayers.com")) {
                            emitJavPlayers(nested, candidate)
                        } else {
                            emitExtractor(nested, candidate)
                        }
                    }
                } catch (e: Throwable) {
                    Log.e(name, "Nested player scan failed for $candidate: ${e.message}")
                }
            }
        }

        return emitted
    }

    private suspend fun collectSubtitles(document: Document, subtitleCallback: (SubtitleFile) -> Unit) {
        val elements = ArrayList<Element>(document.select("track[kind=subtitles], track[src], a[href$=.srt], a[href$=.vtt]"))
        for (i in 0 until elements.size) {
            val element = elements.get(i)
            val raw = element.attr("src").ifBlank { element.attr("href") }
            val url = fixUrlNull(raw) ?: continue
            val rawLabel = element.attr("label")
            val labelText = element.text()
            val label = if (rawLabel.isNotBlank()) rawLabel.cleanText() else { if (labelText.isNotBlank()) labelText.cleanText() else "Subtitle" }
            subtitleCallback(newSubtitleFile(label, url))
        }
    }

    private fun extractRocketLazyScripts(document: Document): List<String> {
        val scripts = mutableListOf<String>()

        val lazyElements = ArrayList<Element>(document.select("script[data-rocketlazyloadscript]"))
        for (i in 0 until lazyElements.size) {
            val script = lazyElements.get(i)
            val value = script.attr("data-rocketlazyloadscript")
            if (value.contains("base64,", ignoreCase = true)) {
                val raw = value.substringAfter("base64,")
                val decoded = decodeBase64(raw)
                if (decoded != null) {
                    scripts.add(decoded)
                }
            } else if (value.isNotBlank()) {
                scripts.add(value)
            }
        }

        val scriptElements = ArrayList<Element>(document.select("script"))
        for (i in 0 until scriptElements.size) {
            val script = scriptElements.get(i)
            val text = script.data().ifBlank { script.html() }.ifBlank { script.text() }
            if (text.isNotBlank()) {
                scripts.add(text)

                val regex = Regex("""(?i)atob\(['"]([^'"]+)['"]\)""")
                for (match in regex.findAll(text)) {
                    val decoded = decodeBase64(match.groupValues[1])
                    if (decoded != null) {
                        scripts.add(decoded)
                    }
                }
            }
        }

        return scripts
    }

    private fun extractUrlsFromText(value: String): List<String> {
        val normalized = value
            .replace("\\/", "/")
            .replace("&amp;", "&")
            .replace("\\u0026", "&")

        val urls = linkedSetOf<String>()

        val regex1 = Regex("""(?i)https?://[^\s'"<>\\]+""")
        for (match in regex1.findAll(normalized)) {
            urls.add(match.value.trimEnd(',', ';', ')', ']', '}'))
        }

        val regex2 = Regex("""(?i)//[^\s'"<>\\]+""")
        for (match in regex2.findAll(normalized)) {
            urls.add("https:${match.value}".trimEnd(',', ';', ')', ']', '}'))
        }

        val regex3 = Regex("""(?i)https?%3A%2F%2F[^\s'"<>\\]+""")
        for (match in regex3.findAll(value)) {
            val decoded = decodeUrl(match.value)
            if (decoded != null) {
                urls.add(decoded)
            }
        }

        return urls.toList()
    }

    private fun decodeBase64(value: String): String? {
        return try {
            String(Base64.getDecoder().decode(value), Charsets.UTF_8)
        } catch (_: Throwable) {
            null
        }
    }

    private fun decodeUrl(value: String): String? {
        return try {
            URLDecoder.decode(value, "UTF-8")
        } catch (_: Throwable) {
            null
        }
    }

    private fun String.normalizedCandidate(): String? {
        val decoded = decodeUrl(this) ?: this
        val clean = decoded
            .replace("\\/", "/")
            .replace("&amp;", "&")
            .replace("\\u0026", "&")
            .trim()
            .trim('"', '\'', '`', ',', ';', ')', ']', '}')

        if (clean.lowercase() == "") return null
        if (clean.startsWith("data:", ignoreCase = true)) return null
        if (clean.startsWith("blob:", ignoreCase = true)) return null
        if (clean.startsWith("javascript:", ignoreCase = true)) return null

        return when {
            clean.startsWith("//") -> "https:$clean"
            clean.startsWith("http://") || clean.startsWith("https://") -> clean
            clean.startsWith("/") -> mainUrl.trimEnd('/') + clean
            clean.contains("javplayers.com") -> clean
            clean.contains("player.php") || clean.contains("embed.php") -> {
                mainUrl.trimEnd('/') + "/" + clean.removePrefix("/")
            }
            else -> null
        }
    }

    private fun String.isPlayableCandidate(): Boolean {
        val lower = lowercase()

        if (lower.contains("thumbnail.") || lower.contains("/image/") || lower.endsWith(".jpg") || lower.endsWith(".png") || lower.endsWith(".webp") || lower.endsWith(".js") || lower.endsWith(".css")) {
            return false
        }

        if (lower.contains(".m3u8") || lower.contains(".mp4")) {
            return true
        }

        val schemaStripRegex = Regex("""^(https?://)?(www\.)?""")
        val compareUrl = lower.replace(schemaStripRegex, "")
        val hasExtractor = extractorApis.any { extractor ->
            val compareExtractorMainUrl = extractor.mainUrl.lowercase().replace(schemaStripRegex, "")
            compareUrl.startsWith(compareExtractorMainUrl)
        }
        if (hasExtractor) return true

        val knownStreamKeywords = listOf(
            "streamvid", "dood", "ds2play", "streamtape", "mixdrop", "upstream",
            "voe", "filemoon", "pixeldrain", "gofile", "mp4upload", "sibnet", "ok.ru", "cda.pl",
            "vidhide", "streamwish", "hxfile", "febbox", "filelions", "vipanel", "pixel",
            "javrider", "javplayers"
        )
        return knownStreamKeywords.any { lower.contains(it) } || (lower.contains("player") && lower.contains("php"))
    }

    private fun String.isDirectMedia(): Boolean {
        val lower = lowercase()
        return lower.contains(".m3u8") || lower.contains(".mp4")
    }

    private fun Element.getImageUrl(): String? {
        return attr("abs:data-src").takeIf { it.isNotBlank() }
            ?: attr("abs:data-lazy-src").takeIf { it.isNotBlank() }
            ?: attr("abs:data-original").takeIf { it.isNotBlank() }
            ?: attr("abs:src").takeIf { it.isNotBlank() }
            ?: attr("data-src").takeIf { it.isNotBlank() }?.let { fixUrlNull(it) }
            ?: attr("data-lazy-src").takeIf { it.isNotBlank() }?.let { fixUrlNull(it) }
            ?: attr("data-original").takeIf { it.isNotBlank() }?.let { fixUrlNull(it) }
            ?: attr("src").takeIf { it.isNotBlank() }?.let { fixUrlNull(it) }
    }

    private fun String.extractCssBackgroundUrl(): String? {
        return Regex("""url\(['"]?([^'")]+)['"]?\)""")
            .find(this)
            ?.groupValues
            ?.getOrNull(1)
    }

    private fun String.cleanTitle(): String {
        return cleanText()
            .replace(Regex("""\s+-\s+Javrider\s*$""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s+JavriderId\s*$""", RegexOption.IGNORE_CASE), "")
            .trim()
    }

    private fun String.cleanText(): String {
        return replace('\u00a0', ' ')
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun String.durationTextToMinutes(): Int? {
        val match = Regex("""(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})""").find(this.cleanText())
            ?: return null

        val parts = match.groupValues
        val hours = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val minutes = parts.getOrNull(2)?.toIntOrNull() ?: 0

        return hours * 60 + minutes
    }

    private fun String.durationToMinutes(): Int? {
        val match = Regex("""P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?""", RegexOption.IGNORE_CASE)
            .find(this)
            ?: return durationTextToMinutes()

        val days = match.groupValues.getOrNull(1)?.toIntOrNull() ?: 0
        val hours = match.groupValues.getOrNull(2)?.toIntOrNull() ?: 0
        val minutes = match.groupValues.getOrNull(3)?.toIntOrNull() ?: 0

        return days * 24 * 60 + hours * 60 + minutes
    }

    data class JavPlayersResponse(
        @JsonProperty("securedLink") val securedLink: String?,
        @JsonProperty("videoSource") val videoSource: String?
    )
}
