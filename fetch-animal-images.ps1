param([switch]$MetadataOnly)
$ErrorActionPreference = 'Stop'

$animals = @(
    @{ title = 'Saola'; slug = 'saola' }, @{ title = 'Okapi'; slug = 'okapi' },
    @{ title = 'Aye-aye'; slug = 'aye-aye' }, @{ title = 'Proboscis monkey'; slug = 'proboscis-monkey' },
    @{ title = 'Hirola'; slug = 'hirola' }, @{ title = 'Pygmy three-toed sloth'; slug = 'pygmy-three-toed-sloth' },
    @{ title = 'Sunda pangolin'; slug = 'sunda-pangolin' }, @{ title = 'Axolotl'; slug = 'axolotl' },
    @{ title = 'Gharial'; slug = 'gharial' }, @{ title = 'Hawksbill sea turtle'; slug = 'hawksbill-turtle' },
    @{ title = 'Kakapo'; slug = 'kakapo' }, @{ title = 'Helmeted hornbill'; slug = 'helmeted-hornbill' },
    @{ title = 'Philippine eagle'; slug = 'philippine-eagle' }, @{ title = 'African penguin'; slug = 'african-penguin' },
    @{ title = 'Vaquita'; slug = 'vaquita' }, @{ title = 'Whale shark'; slug = 'whale-shark' },
    @{ title = 'Largetooth sawfish'; slug = 'largetooth-sawfish' }, @{ title = 'Giant oceanic manta ray'; slug = 'giant-oceanic-manta-ray' },
    @{ title = 'European eel'; slug = 'european-eel' }, @{ title = 'Golden poison frog'; slug = 'golden-poison-frog' },
    @{ title = 'Javan rhinoceros'; slug = 'javan-rhinoceros' }, @{ title = 'Sumatran rhinoceros'; slug = 'sumatran-rhinoceros' },
    @{ title = 'Black rhinoceros'; slug = 'black-rhinoceros' }, @{ title = 'African forest elephant'; slug = 'african-forest-elephant' },
    @{ title = 'Asian elephant'; slug = 'asian-elephant' }, @{ title = 'Sumatran orangutan'; slug = 'sumatran-orangutan' },
    @{ title = 'Tapanuli orangutan'; slug = 'tapanuli-orangutan' }, @{ title = 'Bornean orangutan'; slug = 'bornean-orangutan' },
    @{ title = 'Cross River gorilla'; slug = 'cross-river-gorilla' }, @{ title = 'Bonobo'; slug = 'bonobo' },
    @{ title = 'Red panda'; slug = 'red-panda' }, @{ title = 'Ethiopian wolf'; slug = 'ethiopian-wolf' },
    @{ title = 'African wild dog'; slug = 'african-wild-dog' }, @{ title = 'Tiger'; slug = 'tiger' },
    @{ title = 'Iberian lynx'; slug = 'iberian-lynx' }, @{ title = 'Mediterranean monk seal'; slug = 'mediterranean-monk-seal' },
    @{ title = 'Hawaiian monk seal'; slug = 'hawaiian-monk-seal' }, @{ title = 'North Atlantic right whale'; slug = 'north-atlantic-right-whale' },
    @{ title = 'Blue whale'; slug = 'blue-whale' }, @{ title = 'Antarctic blue whale'; slug = 'antarctic-blue-whale' },
    @{ title = 'Dugong'; slug = 'dugong' }, @{ title = 'Amazon river dolphin'; slug = 'amazon-river-dolphin' },
    @{ title = 'Indus river dolphin'; slug = 'indus-river-dolphin' }, @{ title = 'Polar bear'; slug = 'polar-bear' },
    @{ title = 'Giant panda'; slug = 'giant-panda' }, @{ title = 'Koala'; slug = 'koala' },
    @{ title = 'Tasmanian devil'; slug = 'tasmanian-devil' }, @{ title = 'Northern hairy-nosed wombat'; slug = 'northern-hairy-nosed-wombat' },
    @{ title = 'Ring-tailed lemur'; slug = 'ring-tailed-lemur' }, @{ title = 'Greater bamboo lemur'; slug = 'greater-bamboo-lemur' },
    @{ title = 'California condor'; slug = 'california-condor' }, @{ title = 'Whooping crane'; slug = 'whooping-crane' },
    @{ title = 'Grey parrot'; slug = 'african-grey-parrot' }, @{ title = 'Shoebill'; slug = 'shoebill' },
    @{ title = 'Secretarybird'; slug = 'secretarybird' }, @{ title = 'White-backed vulture'; slug = 'white-backed-vulture' },
    @{ title = 'Hooded vulture'; slug = 'hooded-vulture' }, @{ title = 'Egyptian vulture'; slug = 'egyptian-vulture' },
    @{ title = 'Great Indian bustard'; slug = 'great-indian-bustard' }, @{ title = 'Bengal florican'; slug = 'bengal-florican' },
    @{ title = 'Spoon-billed sandpiper'; slug = 'spoon-billed-sandpiper' }, @{ title = 'Yellow-crested cockatoo'; slug = 'yellow-crested-cockatoo' },
    @{ title = 'Bali myna'; slug = 'bali-myna' }, @{ title = 'Orange-bellied parrot'; slug = 'orange-bellied-parrot' },
    @{ title = 'Regent honeyeater'; slug = 'regent-honeyeater' }, @{ title = 'Yellow-eyed penguin'; slug = 'yellow-eyed-penguin' },
    @{ title = 'Galapagos penguin'; slug = 'galapagos-penguin' }, @{ title = 'Blue-throated macaw'; slug = 'blue-throated-macaw' },
    @{ title = "Lear's macaw"; slug = 'lears-macaw' }, @{ title = 'Harpy eagle'; slug = 'harpy-eagle' },
    @{ title = 'Andean condor'; slug = 'andean-condor' }, @{ title = 'Grey crowned crane'; slug = 'grey-crowned-crane' },
    @{ title = 'Northern bald ibis'; slug = 'northern-bald-ibis' }, @{ title = 'Atlantic puffin'; slug = 'atlantic-puffin' },
    @{ title = 'Macaroni penguin'; slug = 'macaroni-penguin' }, @{ title = 'Chinese alligator'; slug = 'chinese-alligator' },
    @{ title = 'Siamese crocodile'; slug = 'siamese-crocodile' }, @{ title = 'Philippine crocodile'; slug = 'philippine-crocodile' },
    @{ title = 'Orinoco crocodile'; slug = 'orinoco-crocodile' }, @{ title = 'Radiated tortoise'; slug = 'radiated-tortoise' },
    @{ title = 'Ploughshare tortoise'; slug = 'ploughshare-tortoise' }, @{ title = 'Yangtze giant softshell turtle'; slug = 'yangtze-giant-softshell-turtle' },
    @{ title = 'Leatherback sea turtle'; slug = 'leatherback-turtle' }, @{ title = "Kemp's ridley sea turtle"; slug = 'kemps-ridley-turtle' },
    @{ title = 'Loggerhead sea turtle'; slug = 'loggerhead-turtle' }, @{ title = 'Komodo dragon'; slug = 'komodo-dragon' },
    @{ title = 'Marine iguana'; slug = 'marine-iguana' }, @{ title = 'Panamanian golden frog'; slug = 'panamanian-golden-frog' },
    @{ title = 'Mountain chicken'; slug = 'mountain-chicken' }, @{ title = 'Chinese giant salamander'; slug = 'chinese-giant-salamander' },
    @{ title = 'European sea sturgeon'; slug = 'european-sturgeon' }, @{ title = 'Mekong giant catfish'; slug = 'mekong-giant-catfish' },
    @{ title = 'Great hammerhead'; slug = 'great-hammerhead' }, @{ title = 'Oceanic whitetip shark'; slug = 'oceanic-whitetip-shark' },
    @{ title = 'Southern bluefin tuna'; slug = 'southern-bluefin-tuna' }, @{ title = 'Elkhorn coral'; slug = 'elkhorn-coral' },
    @{ title = 'Staghorn coral'; slug = 'staghorn-coral' }, @{ title = 'Rusty patched bumble bee'; slug = 'rusty-patched-bumble-bee' },
    @{ title = 'Monarch butterfly'; slug = 'monarch-butterfly' }, @{ title = 'Black abalone'; slug = 'black-abalone' }
)

$headers = @{ 'User-Agent' = 'VanishingWildEducationalSite/1.0 (animal image attribution)' }
$outputDirectory = Join-Path $PSScriptRoot 'images/animals'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$redirects = @{}
$pages = @()
for ($offset = 0; $offset -lt $animals.Count; $offset += 40) {
    $batch = @($animals[$offset..([Math]::Min($offset + 39, $animals.Count - 1))])
    $titles = [uri]::EscapeDataString(($batch.title -join '|'))
    $pageResponse = Invoke-RestMethod -Headers $headers -TimeoutSec 30 -Uri "https://en.wikipedia.org/w/api.php?action=query&titles=$titles&prop=pageimages&format=json&pithumbsize=1200&redirects=1"
    foreach ($redirect in $pageResponse.query.redirects) { $redirects[$redirect.from] = $redirect.to }
    $pages += @($pageResponse.query.pages.PSObject.Properties.Value)
}

$resolvedImages = @()
foreach ($animal in $animals) {
    $resolvedTitle = if ($redirects.ContainsKey($animal.title)) { $redirects[$animal.title] } else { $animal.title }
    $page = $pages | Where-Object { $_.title -eq $resolvedTitle } | Select-Object -First 1
    if (!$page.thumbnail.source -or !$page.pageimage) {
        Write-Warning "No image found for $($animal.title)"
        continue
    }
    $resolvedImages += [pscustomobject]@{ animal = $animal; page = $page; fileTitle = 'File:' + $page.pageimage }
}

$infoPages = @()
for ($offset = 0; $offset -lt $resolvedImages.Count; $offset += 40) {
    $batch = @($resolvedImages[$offset..([Math]::Min($offset + 39, $resolvedImages.Count - 1))])
    $fileTitles = [uri]::EscapeDataString(($batch.fileTitle -join '|'))
    $infoResponse = Invoke-RestMethod -Headers $headers -TimeoutSec 30 -Uri "https://commons.wikimedia.org/w/api.php?action=query&titles=$fileTitles&prop=imageinfo&iiprop=url%7Cextmetadata&format=json"
    $infoPages += @($infoResponse.query.pages.PSObject.Properties.Value)
}
$results = @()

foreach ($item in $resolvedImages) {
    $normalizedFileTitle = $item.fileTitle -replace '_', ' '
    $infoPage = $infoPages | Where-Object { ($_.title -replace '_', ' ') -eq $normalizedFileTitle } | Select-Object -First 1
    $imageInfo = $infoPage.imageinfo | Select-Object -First 1
    $extension = [IO.Path]::GetExtension(([uri]$item.page.thumbnail.source).AbsolutePath).ToLowerInvariant()
    if (!$extension -or $extension.Length -gt 5) { $extension = '.jpg' }
    $relativeFile = "images/animals/$($item.animal.slug)$extension"
    $destination = Join-Path $PSScriptRoot $relativeFile
    if (!$MetadataOnly -and !(Test-Path -LiteralPath $destination)) {
        for ($attempt = 1; $attempt -le 4; $attempt++) {
            try {
                Invoke-WebRequest -Headers $headers -TimeoutSec 60 -Uri $item.page.thumbnail.source -OutFile $destination
                break
            } catch {
                if ($attempt -eq 4) { throw }
                $pauseSeconds = 15 * $attempt
                Write-Warning "Download paused for $($item.animal.title); retrying in $pauseSeconds seconds."
                Start-Sleep -Seconds $pauseSeconds
            }
        }
        Start-Sleep -Milliseconds 1000
    }
    $results += [pscustomobject]@{
        title = $item.animal.title
        file = $relativeFile
        remote = $item.page.thumbnail.source
        source = $imageInfo.descriptionurl
        license = $imageInfo.extmetadata.LicenseShortName.value
        artist = ($imageInfo.extmetadata.Artist.value -replace '<[^>]+>', '' -replace '&[^;]+;', ' ').Trim()
    }
    Write-Output "$($item.animal.title) -> $relativeFile"
}

$results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'images/animal-photo-credits.json') -Encoding utf8
