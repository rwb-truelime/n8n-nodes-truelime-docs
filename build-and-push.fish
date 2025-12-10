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

function get_latest_v1_version
    # Allow manual override via environment variable
    if set -q N8N_VERSION; and test -n "$N8N_VERSION"
        echo $N8N_VERSION
        return 0
    end

    # Try pnpm view (since this is a Node project)
    if type -q pnpm
        set -l ver_json (pnpm view n8n versions --json 2>/dev/null)
        if test $status -eq 0
            set -l ver (echo $ver_json | node -e '
                try {
                    const versions = JSON.parse(require("fs").readFileSync(0, "utf-8"));
                    const v1 = versions
                        .filter(v => /^1\.\d+\.\d+$/.test(v))
                        .sort((a, b) => {
                            const pa = a.split(".").map(Number);
                            const pb = b.split(".").map(Number);
                            for (let i = 0; i < 3; i++) {
                                if (pa[i] > pb[i]) return 1;
                                if (pa[i] < pb[i]) return -1;
                            }
                            return 0;
                        });
                    if (v1.length > 0) console.log(v1[v1.length - 1]);
                    else process.exit(1);
                } catch (e) { process.exit(1); }
            ')
            if test $status -eq 0; and test -n "$ver"
                echo $ver
                return 0
            end
        end
    end

    # Fallback: GitHub Releases API
    if type -q curl
        set -l releases_json (curl -fsSL https://api.github.com/repos/n8n-io/n8n/releases 2>/dev/null)
        if test $status -eq 0
            set -l ver (echo $releases_json | node -e '
                try {
                    const releases = JSON.parse(require("fs").readFileSync(0, "utf-8"));
                    const v1 = releases
                        .map(r => r.tag_name.replace(/^n8n@/, ""))
                        .filter(v => /^1\.\d+\.\d+$/.test(v))
                        .sort((a, b) => {
                            const pa = a.split(".").map(Number);
                            const pb = b.split(".").map(Number);
                            for (let i = 0; i < 3; i++) {
                                if (pa[i] > pb[i]) return 1;
                                if (pa[i] < pb[i]) return -1;
                            }
                            return 0;
                        });
                    if (v1.length > 0) console.log(v1[v1.length - 1]);
                    else process.exit(1);
                } catch (e) { process.exit(1); }
            ')
            if test $status -eq 0; and test -n "$ver"
                echo $ver
                return 0
            end
        end
    end

    set_color red
    echo "Failed to resolve latest N8N V1 version. Set N8N_VERSION env var." 1>&2
    set_color normal
    exit 1
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

# Resolve V1 version FIRST
set -l N8N_VERSION (get_latest_v1_version)
if test $status -ne 0
    exit 1
end
set_color yellow
echo "Targeting N8N version: $N8N_VERSION"
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

run_step "Docker Build (because it worked on my machine...)" "docker build --no-cache --build-arg N8N_VERSION=$N8N_VERSION --build-arg LIMESCAPE_DOCS_VERSION=$PACKAGE_VERSION -t tlteamai.azurecr.io/n8n/truelime-n8n:$N8N_VERSION ."

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
