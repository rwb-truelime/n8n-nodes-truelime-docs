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
        if test "$IGNORE_ERRORS" != "true"
            rm -f $log $codefile
            exit $code
        end
    end
    rm -f $log $codefile
    return $code
end

function get_stable_v2_version
    set -l n8n_version

    # An override may select an older stable release, but it is still verified
    # against n8n's published GitHub release tag below.
    if set -q N8N_VERSION; and test -n "$N8N_VERSION"
        set n8n_version $N8N_VERSION
    else
        # The npm stable dist-tag is the sole automatic version source.
        if not type -q pnpm
            set_color red
            echo "pnpm is required to resolve n8n's stable release." 1>&2
            set_color normal
            return 1
        end

        set n8n_version (pnpm view n8n dist-tags.stable 2>/dev/null)
        if test $status -ne 0; or test (count $n8n_version) -ne 1
            set_color red
            echo "Failed to resolve npm's stable n8n release." 1>&2
            set_color normal
            return 1
        end
    end

    if not string match -qr '^2\.[0-9]+\.[0-9]+$' -- $n8n_version
        set_color red
        echo "n8n version must be a stable v2 release: $n8n_version" 1>&2
        set_color normal
        return 1
    end

    if not type -q curl
        set_color red
        echo "curl is required to verify the n8n release tag." 1>&2
        set_color normal
        return 1
    end

    # npm's channel tag alone is not enough: require the official stable tag.
    curl -fsSL --retry 3 "https://api.github.com/repos/n8n-io/n8n/releases/tags/n8n%40$n8n_version" | node -e '
        const fs = require("fs");
        const release = JSON.parse(fs.readFileSync(0, "utf8"));
        const version = process.argv[1];
        if (release.tag_name !== `n8n@${version}` || release.prerelease || release.draft) process.exit(1);
    ' "$n8n_version"
    set -l pipe_status $pipestatus
    if test $pipe_status[1] -ne 0; or test $pipe_status[2] -ne 0
        set_color red
        echo "n8n $n8n_version is not a published stable n8n release tag." 1>&2
        set_color normal
        return 1
    end

    echo $n8n_version
end

function get_n8n_node_builder_image
    set -l n8n_version $argv[1]
    if not type -q curl
        set_color red
        echo "curl is required to resolve the n8n native build image." 1>&2
        set_color normal
        return 1
    end

    set -l dockerfile_url "https://raw.githubusercontent.com/n8n-io/n8n/n8n%40$n8n_version/docker/images/n8n/Dockerfile"
    set -l builder_image (curl -fsSL --retry 3 "$dockerfile_url" | string match -r '^ARG BUILDER_IMAGE=.*$' | string replace -r '^ARG BUILDER_IMAGE=' '')
    if test $status -ne 0; or test (count $builder_image) -ne 1
        set_color red
        echo "Failed to resolve the native Node builder image for n8n $n8n_version." 1>&2
        set_color normal
        return 1
    end

    echo $builder_image
end

set IGNORE_ERRORS "false"
if contains -- --ignore-errors $argv
    set IGNORE_ERRORS "true"
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

# Resolve V2 version FIRST
set -l N8N_VERSION (get_stable_v2_version)
if test $status -ne 0
    exit 1
end
set_color yellow
echo "Targeting N8N version: $N8N_VERSION"
set_color normal

set -l N8N_NODE_BUILDER_IMAGE (get_n8n_node_builder_image $N8N_VERSION)
if test $status -ne 0
    exit 1
end
set_color yellow
echo "Using upstream Node builder: $N8N_NODE_BUILDER_IMAGE"
set_color normal

run_step "Linting (fixing your sins...)" "pnpm lint --fix"
run_step "Building (summoning the TypeScript demons...)" "pnpm run build"
run_step "Packing (compressing your hopes and dreams...)" "pnpm pack"

run_step "Docker pull n8n:$N8N_VERSION" "docker pull docker.n8n.io/n8nio/n8n:$N8N_VERSION"

# Get package version
set -l PACKAGE_VERSION (node -p "require('./package.json').version")
set_color yellow
echo "Using Limescape Docs version: $PACKAGE_VERSION"
set_color normal

run_step "Docker Build (because it worked on my machine...)" "docker build -f Dockerfile-n8n-v2 --no-cache --build-arg N8N_VERSION=$N8N_VERSION --build-arg N8N_NODE_BUILDER_IMAGE=$N8N_NODE_BUILDER_IMAGE --build-arg LIMESCAPE_DOCS_VERSION=$PACKAGE_VERSION -t tlteamai.azurecr.io/n8n/truelime-n8n:$N8N_VERSION ."

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
    if test "$IGNORE_ERRORS" != "true"
        exit $code
    end
    return $code
end

push_image tlteamai.azurecr.io/n8n/truelime-n8n:$N8N_VERSION

echo
set_color magenta
echo '  All done! If it failed, blame the intern.'
echo '  If it worked, take the rest of the day off.'
echo '  ─ The Automation Overlords'
set_color normal
