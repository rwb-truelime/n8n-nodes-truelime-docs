#!/usr/bin/env fish

function spinner
    set -l pid $argv[1]
    set -l spin "-\\|/"
    set -l i 0
    while kill -0 $pid > /dev/null 2>&1
        set i (math "($i + 1) % 4")
        printf "\r%s Working... (or pretending to)" (string sub -s (math $i + 1) -l 1 $spin)
        sleep 0.2
    end
    printf "\r"
end

function run_step
    set -l msg $argv[1]
    set -l cmd $argv[2..-1]
    echo
    set_color blue
    echo "==> $msg"
    set_color normal
    set -l log (mktemp)
    set -l codefile (mktemp)
    begin
        eval $cmd 2>&1 | tee $log
        set -l st $pipestatus[1]
        echo $st > $codefile
    end &
    set -l pid $last_pid
    spinner $pid
    wait $pid
    set -l code (cat $codefile 2>/dev/null)
    if test -z "$code"
        set code 1
    end
    if test $code -eq 0
        set_color green
        echo "✔ $msg complete!"
        set_color normal
    else
        set_color red
        echo "✖ $msg failed (exit $code)"
        set_color normal
        echo "---- output ----"
        cat $log
        echo "----------------"
    end
    rm -f $log $codefile
    return $code
end

function resolve_n8n_version
    function __is_semver --argument-names v
        if test -z "$v"; or not string match -qr '^[0-9]+\.[0-9]+\.[0-9]+$' -- $v
            return 1
        end
        return 0
    end

    # Allow manual override via environment variable
    if set -q N8N_VERSION; and test -n "$N8N_VERSION"
        if __is_semver $N8N_VERSION
            echo $N8N_VERSION
            return 0
        end
    end

    set -l image docker.n8n.io/n8nio/n8n:latest

    # Prefer ENV inside the image (e.g., N8N_VERSION)
    set -l env_lines (docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $image 2>/dev/null)
    for line in $env_lines
        if string match -qr '^N8N_VERSION=' -- $line
            set -l env_ver (string replace -r '^N8N_VERSION=' '' -- $line)
            if __is_semver $env_ver
                echo $env_ver
                return 0
            end
        end
    end

    # Next: query GitHub Releases API for latest tag and extract X.Y.Z
    if type -q curl
        set -l tag ""
        if type -q jq
            set tag (curl -fsSL https://api.github.com/repos/n8n-io/n8n/releases/latest 2>/dev/null | jq -r '.tag_name // empty')
        else if type -q python3
            set tag (curl -fsSL https://api.github.com/repos/n8n-io/n8n/releases/latest 2>/dev/null | python3 -c 'import sys, json; print(json.load(sys.stdin).get("tag_name",""))')
        else
            set -l raw (curl -fsSL https://api.github.com/repos/n8n-io/n8n/releases/latest 2>/dev/null)
            # Best-effort JSON scrape without jq/python using sed (no reliance on fish's -o)
            set tag (printf %s $raw | sed -nE 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -n 1)
        end

        if test -n "$tag"
            set -l ver (string replace -r '.*([0-9]+\.[0-9]+\.[0-9]+).*' '$1' -- $tag)
            if __is_semver $ver
                echo $ver
                return 0
            end
        end
    end

    # Last: try common labels on the image (can be misleading; validate)
    set -l label_ver (docker inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' $image 2>/dev/null)
    if test -n "$label_ver"; and test "$label_ver" != "<no value>"; and __is_semver $label_ver
        echo $label_ver
        return 0
    end

    set label_ver (docker inspect --format '{{index .Config.Labels "org.label-schema.version"}}' $image 2>/dev/null)
    if test -n "$label_ver"; and test "$label_ver" != "<no value>"; and __is_semver $label_ver
        echo $label_ver
        return 0
    end

    set_color red
    echo "Failed to resolve N8N version. Set N8N_VERSION env var and re-run." 1>&2
    set_color normal
    exit 1
end

echo
set_color red
echo '  ███╗   ██╗███╗   ██╗██╗███╗   ███╗'
echo '  ████╗  ██║████╗  ██║██║████╗ ████║'
echo '  ██╔██╗ ██║██╔██╗ ██║██║██╔████╔██║'
echo '  ██║╚██╗██║██║╚██╗██║██║██║╚██╔╝██║'
echo '  ██║ ╚████║██║ ╚████║██║██║ ╚═╝ ██║'
echo '  ╚═╝  ╚═══╝╚═╝  ╚═══╝╚═╝╚═╝     ╚═╝'
echo '      Welcome to the Buildpocalypse!'
set_color normal

run_step "Linting (fixing your sins...)" "pnpm lint --fix"
run_step "Building (summoning the TypeScript demons...)" "pnpm run build"
run_step "Packing (compressing your hopes and dreams...)" "pnpm pack"
run_step "Docker pull the latest N8N image (because we don't trust the cloud...)" "docker pull docker.n8n.io/n8nio/n8n:latest"

# Resolve the concrete N8N version from the pulled 'latest' image (or GitHub as fallback)
set -l N8N_VERSION (resolve_n8n_version)
set_color yellow
echo "Using N8N version: $N8N_VERSION"
set_color normal

run_step "Docker Build (because it worked on my machine...)" "docker build --no-cache -t tlteamai.azurecr.io/n8n/truelime-n8n:$N8N_VERSION ."

function push_image
    set -l image $argv[1]
    set -l msg "Docker Push (uploading to the cloud, where bugs go to multiply...)"
    echo
    set_color blue
    echo "==> $msg"
    set_color normal
    set -l log (mktemp)
    set -l codefile (mktemp)
    begin
        docker push $image 2>&1 | tee $log
        set -l st $pipestatus[1]
        echo $st > $codefile
    end &
    set -l pid $last_pid
    spinner $pid
    wait $pid
    set -l code (cat $codefile 2>/dev/null)
    if test -z "$code"
        set code 1
    end
    if test $code -eq 0
        set_color green
        echo "✔ $msg complete!"
        set_color normal
        rm -f $log $codefile
        return 0
    end

    set -l unauthorized (grep -i 'unauthorized' $log | wc -l)
    if test $unauthorized -gt 0
        set_color red
        echo "✖ Push failed: unauthorized to push to $image"
        set_color normal
        echo "You're not logged in to the registry or don't have permission."
        echo "How to fix (choose one):"
        echo "  - docker login tlteamai.azurecr.io"
        if type -q az
            echo "  - az acr login --name tlteamai"
        end
        echo "Then rerun the script, or retry:"
        echo "  docker push $image"
    else
        set_color red
        echo "✖ $msg failed (exit $code)"
        set_color normal
    end
    # Suppress verbose docker output; logs are available in $log if needed.
    rm -f $log $codefile
    exit $code
end

push_image tlteamai.azurecr.io/n8n/truelime-n8n:$N8N_VERSION

echo
set_color magenta
echo '  All done! If it failed, blame the intern.'
echo '  If it worked, take the rest of the day off.'
echo '  ─ The Automation Overlords'
set_color normal
