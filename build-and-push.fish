#!/usr/bin/env fish

function spinner
    set -l pid $argv[1]
    set -l spin "-\|/"
    set -l i 0
    while kill -0 $pid > /dev/null 2>&1
        set i (math "($i + 1) % 4")
        printf "\r%s Working... (or pretending to)" (string sub -s $i -l 1 $spin)
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
    eval $cmd &
    set -l pid $last_pid
    spinner $pid
    wait $pid
    set_color green
    echo "✔ $msg complete!"
    set_color normal
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
run_step "Docker Build (because it worked on my machine...)" "docker build --no-cache  -t tlteamai.azurecr.io/n8n/truelime-n8n:latest ."
run_step "Docker Push (uploading to the cloud, where bugs go to multiply...)" "docker push tlteamai.azurecr.io/n8n/truelime-n8n:latest"

echo
set_color magenta
echo '  All done! If it failed, blame the intern.'
echo '  If it worked, take the rest of the day off.'
echo '  ─ The Automation Overlords'
set_color normal
